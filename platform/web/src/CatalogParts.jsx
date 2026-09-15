import { Icon } from "./components";
import "./catalog-indexes.css";

export function CatalogSearch({ value, onChange, placeholder = "搜索…", label = placeholder }) {
  return <label className="search catalog-search"><Icon name="search" /><input aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></label>;
}

export function CatalogPager({ page, count, size = 18, onChange }) {
  const pages = Math.max(1, Math.ceil(count / size));
  if (pages === 1) return null;
  return <nav className="catalog-pager" aria-label="结果分页">
    <button disabled={page === 0} onClick={() => onChange(page - 1)}>上一页</button>
    <span>{page + 1} / {pages} <small>· 共 {count} 项</small></span>
    <button disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>下一页</button>
  </nav>;
}

export function CollectionCard({ title, count, unit = "词", preview, onClick }) {
  return <button className="catalog-collection" onClick={onClick}>
    <span className="catalog-collection-top"><strong>{title}</strong><span>{count} <small>{unit}</small></span></span>
    {preview && <span className="catalog-collection-preview">{preview}</span>}
    <span className="catalog-collection-link">打开词表 <span aria-hidden="true">↗</span></span>
  </button>;
}

export function studyDay(value, timeZone = "Asia/Shanghai") {
  if (!value || Number.isNaN(Date.parse(value))) return "日期未记录";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function materialLabel(material, materials = []) {
  const match = materials.find(item => item.id === material);
  return (match?.title || match?.filename || material || "未记录教材").replace(/\.pdf$/i, "");
}

export function sourceLabel(source, materials = []) {
  const matched = materials.find(item => item.id === source.material_id);
  if (matched) return materialLabel(source.material_id, materials);
  const raw = source.record || source.material_id || "";
  const date = raw.match(/(20\d{2})(\d{2})(\d{2})/);
  const dateLabel = date ? `${date[1]}-${date[2]}-${date[3]} · ` : "";
  if (/handwritten|手写/i.test(`${raw} ${source.kind}`)) return `${dateLabel}手写笔记`;
  if (/captur|摘词/i.test(`${raw} ${source.kind}`)) return `${dateLabel}题中摘词整理`;
  if (/homework/i.test(raw)) return `${dateLabel}历史词汇训练`;
  return source.material_id || raw.split(/[\\/]/).at(-1)?.replace(/\.(json|md|yaml)$/i, "") || "历史词库";
}

export const selfRatingLabels = { remembered: "自评记得", partial: "自评模糊", forgotten: "自评忘记" };
