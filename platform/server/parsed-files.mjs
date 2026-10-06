import fs from "node:fs/promises";
import path from "node:path";

// Check metadata on every access so edits, Git pulls, and replacements stay visible.
// Callers get their own objects for projections to annotate.
export class ParsedFiles {
  constructor(root) {
    this.root = root;
    this.entries = new Map();
  }
  async read(relative, parse, fallback) {
    const filename = path.join(this.root, relative);
    try {
      const stat = await fs.stat(filename);
      const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      let entry = this.entries.get(relative);
      if (!entry || entry.stamp !== stamp || entry.parse !== parse) {
        const value = parse(await fs.readFile(filename, "utf8"));
        entry = { stamp, parse, value };
        if (this.entries.size >= 10000) this.entries.delete(this.entries.keys().next().value);
        this.entries.set(relative, entry);
      }
      return structuredClone(entry.value);
    } catch (error) {
      this.entries.delete(relative);
      if (error.code === "ENOENT") return structuredClone(fallback);
      throw error;
    }
  }
}
