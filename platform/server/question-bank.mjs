import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { keyOf } from "./store.mjs";

const version = 6;
const sources = {
  tc: ["text_completion_2000", 14],
  se: ["text_completion_2000", 14],
  rc: ["reading_440", 22],
  quant: ["quant_900", 4],
};

// PDF text objects are not in reading order; table cells and split words need
// their coordinates. Crops retain the original typesetting, figures and math.
export function rowsOf(items, height, page) {
  const rows = [];
  for (const item of items.filter(i => i.str?.trim()).map(i => ({
    text: i.str, x: i.transform[4], y: height - i.transform[5], width: i.width,
  })).sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (item.y < 59 || item.y > height - 57) continue;
    let row = rows.at(-1);
    if (!row || Math.abs(row.y - item.y) > 2) {
      row = { page, height, y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  return rows.map(row => {
    let end = 0, text = "";
    for (const item of row.items.sort((a, b) => a.x - b.x)) {
      text += (text && item.x - end > 1.8 ? " " : "") + item.text;
      end = item.x + item.width;
    }
    return { ...row, text: text.trim() };
  });
}

function regions(rows, fullPage = false) {
  const result = [];
  for (const row of rows) {
    let r = result.at(-1);
    if (!r || r.page !== row.page) {
      r = { page: row.page, top: fullPage ? 60 : Math.max(58, row.y - 17), bottom: 0,
        left: fullPage ? 78 : 48, right: 550,
        ...(fullPage ? { focusTop: Math.max(60, row.y - 17) } : {}) };
      result.push(r);
    }
    r.bottom = fullPage ? row.height - 59 : Math.min(row.height - 59, row.y + 9);
    if (fullPage) r.focusBottom = Math.min(row.height - 59, row.y + 9);
  }
  return result;
}
function optionMatches(text, type) {
  // Reading uses at most A–E. An author's initial (e.g. I. Schoep) is prose.
  return [...text.matchAll(new RegExp(`(?:^|\\s)([A-${type === "rc" ? "E" : "I"}])[.．]\\s*`, "g"))];
}
function optionRows(rows, type) {
  if (type === "quant") return rows;
  return rows.map((row, i) => {
    let text = row.text.replace(/([.!?])([A-I])[.．](?=\s)/g, "$1 $2. ");
    const bare = text.match(/^([A-I])\s+(.+)/);
    // A missing dot is recoverable only between the neighbouring option labels.
    if (bare && i > 0 && i + 1 < rows.length) {
      const code = bare[1].charCodeAt(0);
      const before = optionMatches(rows[i - 1].text, type).at(-1)?.[1];
      const after = optionMatches(rows[i + 1].text, type)[0]?.[1];
      if (before === String.fromCharCode(code - 1) && after === String.fromCharCode(code + 1)) text = `${bare[1]}. ${bare[2]}`;
    }
    return text === row.text ? row : { ...row, text };
  });
}
function optionLetters(rows, type) {
  return [...new Set(rows.flatMap(r => optionMatches(r.text, type).map(m => m[1])))].sort();
}
function verbalText(rows, passageRows, mode, type) {
  const clean = value => value.replace(/【[^】]*】/g, "").replace(/([a-z])-\s+([a-z])/g, "$1-$2").trim();
  const first = rows.findIndex(r => optionMatches(r.text, type).length);
  const options = {}, promptRows = first < 0 ? rows : rows.slice(0, first);
  if (first >= 0) {
    const prefix = rows[first].text.slice(0, optionMatches(rows[first].text, type)[0].index).trim();
    if (prefix) promptRows.push({ ...rows[first], text: prefix });
  }
  let previous = "", columns = false, safe = true;
  for (const row of first < 0 ? [] : rows.slice(first)) {
    const matches = optionMatches(row.text, type);
    if (matches.length > 1) columns = true;
    if (matches.length) {
      matches.forEach((m, i) => { options[m[1]] = (options[m[1]] || "") + row.text.slice(m.index + m[0].length, matches[i + 1]?.index ?? row.text.length); });
      previous = matches.at(-1)[1];
    } else if (previous) {
      if (columns) safe = false;
      options[previous] += " " + row.text;
    }
  }
  const paragraphs = [];
  for (const [i, row] of passageRows.entries()) {
    if (/^Passage\s*\d+$/i.test(row.text)) continue;
    const prior = passageRows[i - 1];
    if (!paragraphs.length || prior?.page === row.page && row.y - prior.y > 23) paragraphs.push(row.text);
    else paragraphs[paragraphs.length - 1] += " " + row.text;
  }
  const prompt = clean(promptRows.map(r => r.text).join(" ").replace(/^\d+[.]\s*/, ""));
  return { prompt, options: Object.keys(options).sort().map(k => clean(options[k])), paragraphs: paragraphs.map(clean),
    native: safe && !/�/.test(prompt) && !/highlighted|boldface|bolded|bold type|bold print/i.test(prompt) && (first >= 0 || mode === "sentence") };
}
function makeQuestion(material, unit, number, type, rows, passageRows = []) {
  rows = optionRows(rows, type);
  const text = rows.map(r => r.text).join(" ");
  let letters = optionLetters(rows, type), mode = "single", groups;
  if (type === "tc") {
    if (letters.length === 6 && !/\(ii\)/i.test(text)) type = "se";
    else if (letters.length === 6 || letters.length === 9) {
      mode = "blanks";
      groups = Array.from({ length: letters.length / 3 }, (_, i) => letters.slice(i * 3, i * 3 + 3));
    }
  }
  if (type === "se") mode = "pair";
  if (type === "quant" && /Quantity\s*A/i.test(text) && /Quantity\s*B/i.test(text)) {
    mode = "comparison";
    letters = ["A", "B", "C", "D"];
  } else if (type === "rc" && /(?:select|click on) (?:the |a )?sentence/i.test(text)) mode = "sentence";
  else if ((type === "rc" && letters.length === 3) || /select all|indicate all|one or more/i.test(text)) mode = "multiple";
  else if (!letters.length) mode = "entry";
  const passage = passageRows.map(r => r.text).join(" ").replace(/【[^】]*】/g, "").replace(/^Passage\s*\d+\s*/i, "").replace(/([a-z])-\s+([a-z])/g, "$1-$2");
  const q = {
    material, unit, question: String(number), type, mode, letters, groups,
    regions: regions(rows, type === "quant"), passageRegions: regions(passageRows),
    sentences: mode === "sentence" ? [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(passage)].map(s => s.segment.trim()).filter(Boolean) : undefined,
    ...(type !== "quant" ? verbalText(rows, passageRows, mode, type) : {}),
  };
  return { ...q, key: keyOf(q) };
}

export function parseBook(material, rows) {
  const questions = [];
  if (material === "reading_440") {
    let passage = [];
    function finish() {
      if (!passage.length) return;
      const number = passage[0].text.match(/^Passage\s*(\d+)/i)?.[1];
      if (!number) return;
      const markers = passage.flatMap((r, i) => /^\d{1,2}[.](?=\s*[^\s\d])/.test(r.text) && r.items[0].x < 65 ? [i] : []);
      // Some passages omit "1." but retain "2."; the first options still
      // provide a source boundary for that unnumbered first question.
      if (!markers.length || /^2[.]/.test(passage[markers[0]].text)) {
        const a = passage.findIndex(r => /^A[.]\s*/.test(r.text));
        if (a > 1 && (!markers.length || a < markers[0])) {
          let start = a - 1;
          while (start > 1 && passage[start].page === passage[start - 1].page && passage[start].y - passage[start - 1].y < 20) start--;
          markers.unshift(start);
        }
      }
      if (!markers.length) return; // image-only or unknown layout: never invent a question
      const content = passage.slice(0, markers[0]);
      markers.forEach((start, i) => {
        const part = passage.slice(start, markers[i + 1] ?? passage.length);
        questions.push(makeQuestion(material, `passage${number}`, part[0].text.match(/^(\d+)[.]/)?.[1] || i + 1, "rc", part, content));
      });
    }
    for (const row of rows) {
      if (/^Passage\s*\d+\s*$/i.test(row.text)) { finish(); passage = []; }
      if (passage.length || /^Passage\s*\d+\s*$/i.test(row.text)) passage.push(row);
    }
    finish();
  } else {
    let unit = "", number = "", part = [];
    const quant = material === "quant_900";
    const finish = () => {
      if (part.length && unit && number) questions.push(makeQuestion(material, unit, number, quant ? "quant" : "tc", part));
      part = [];
    };
    for (const row of rows) {
      const section = quant ? row.text.match(/^Section\s*(\d+)\s*[-–]\s*(\S+)/i) : row.text.match(/^test\s*(\d+)\s*section\s*(\d+)\s*\(?\s*(easy|medium|hard)/i);
      if (section) {
        finish(); number = "";
        unit = quant ? `section${section[1]}_${/easy|medium|hard/i.test(section[2]) ? section[2].toLowerCase() : "data"}` : `test${section[1]}_section${section[2]}_${section[3].toLowerCase()}`;
        continue;
      }
      const marker = row.text.match(quant ? /^(\d{1,3})[.](?:\s+|$)/ : /^(\d{1,3})[.](?=\s*[^\s\d]|\s*$)/);
      // Math table values are not question numbers: require the left text margin.
      if (marker && row.items[0].x < (quant ? 100 : 65) && (quant || Number(marker[1]) <= 20)) {
        finish();
        if (quant && Number(marker[1]) <= Number(number) && number) unit = `set_p${row.page}`;
        number = marker[1];
      }
      if (unit && number) part.push(row);
    }
    finish();
  }
  return [...new Map(questions.map(q => [q.key, q])).values()];
}

export class QuestionBank {
  constructor(root) { this.root = root; this.pending = new Map(); }
  async load(type, materials) {
    const source = sources[type];
    if (!source) throw new Error("请选择有效题型");
    const [id, start] = source;
    const material = materials.find(m => m.id === id && m.available);
    if (!material) return [];
    const filename = path.join(this.root, material.repo_path);
    const stat = await fs.stat(filename);
    const signature = `${version}-${stat.size}-${stat.mtimeMs}`;
    const current = this.pending.get(id);
    if (!current || current.signature !== signature) {
      const promise = this.build(id, filename, start, signature).catch(error => { this.pending.delete(id); throw error; });
      this.pending.set(id, { signature, promise });
    }
    return (await this.pending.get(id).promise).filter(q => q.type === type);
  }
  async build(id, filename, start, signature) {
    const cache = path.join(this.root, ".gre-platform", `questions-${id}.json`);
    try {
      const data = JSON.parse(await fs.readFile(cache, "utf8"));
      if (data.signature === signature) return data.questions;
    } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    const task = getDocument({ data: new Uint8Array(await fs.readFile(filename)), verbosity: 0, useSystemFonts: true });
    const rows = [];
    try {
      const pdf = await task.promise;
      for (let n = start; n <= pdf.numPages - (id === "quant_900" ? 0 : 1); n++) {
        const page = await pdf.getPage(n);
        rows.push(...rowsOf((await page.getTextContent()).items, page.view[3], n));
        page.cleanup();
      }
    } finally { await task.destroy(); }
    const questions = parseBook(id, rows);
    await fs.mkdir(path.dirname(cache), { recursive: true });
    await fs.writeFile(cache, JSON.stringify({ signature, questions }));
    return questions;
  }
}

export async function legacyPractice(store, type) {
  const mode = { tc: "text_completion", se: "sentence_equivalence", rc: "reading_comprehension", quant: "quant" }[type];
  const records = [];
  for (const dir of ["verbal/submissions", "quant/submissions"]) {
    for (const file of await store.list(dir)) {
      if (!file.endsWith(".md")) continue;
      const raw = await store.read(`${dir}/${file}`);
      const record = YAML.parse(raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || "{}");
      if (record.mode !== mode || !record.source) continue;
      const range = String(record.source.question_range).match(/^(\d+)(?:-(\d+))?$/);
      if (!range) continue;
      for (let n = +range[1]; n <= +(range[2] || range[1]); n++) records.push({
        material: record.source.material_id, unit: record.source.unit, question: String(n),
        recorded_at: record.started_at || record.date,
      });
    }
  }
  return records.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}
