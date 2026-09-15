// Normalize selections identically in the browser and store; never infer a lemma.
export function capturedWord(value) {
  if (typeof value !== 'string' || value.length > 240) throw new Error('请只选择一个英文单词或短语');
  const word=value.normalize('NFKC').replace(/\u00ad/g,'').replace(/[’‘]/g,"'").replace(/[‐‑]/g,'-').trim()
    .replace(/^[\s"'“”‘’([{.,;:!?]+|[\s"'“”‘’\])}.,;:!?]+$/g,'').replace(/\s+/g,' ').toLowerCase();
  if(word.length>120 || !/^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){0,4}$/.test(word)) throw new Error('请只选择一个英文单词或短语（最多5个词）');
  return word;
}
