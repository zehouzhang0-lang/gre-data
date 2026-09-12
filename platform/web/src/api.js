export async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
export function post(url, data) {
  return request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
export function save(kind, payload, id = crypto.randomUUID()) {
  return post("/api/events", { kind, payload, id });
}
export const keyOf = (q) => JSON.stringify([q.material, q.unit, q.question]);
export const typeNames = {
  tc: "Text Completion",
  se: "Sentence Equivalence",
  rc: "Reading",
  quant: "Quant",
};
export function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
