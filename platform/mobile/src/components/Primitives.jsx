import { useEffect, useId, useRef } from 'react';
import { useBackAction } from '../useBack';

const paths = {
  speaker: <><path d="m11 4-6 5H2v6h3l6 5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  book: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/></>,
  history: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/><path d="M12 7v5l3 2"/></>,
  settings: <><path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="11" r="3"/></>,
  search: <><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></>,
  filter: <><path d="M3 5h18l-7 8v5l-4 3v-8Z"/></>,
  sort: <><path d="M7 20V4m-4 4 4-4 4 4M17 4v16m-4-4 4 4 4-4"/></>,
  down: <path d="m6 9 6 6 6-6"/>,
  back: <path d="m15 5-7 7 7 7"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/></>,
  download: <><path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6"/></>,
};
export function Icon({ name, size = 20 }) { return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.more}</svg>; }
export function Sheet({ title, onClose, children, footer, className = '' }) {
  const id = useId(), ref = useRef(null);
  useBackAction(onClose, true, 100);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const nodes = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    ref.current?.addEventListener('keydown', trap);
    const node = ref.current;
    return () => { node?.removeEventListener('keydown', trap); previous?.focus?.({ preventScroll: true }); };
  }, []);
  return <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`sheet ${className}`}>
    <header className="sheet-header"><h2 id={id}>{title}</h2><button aria-label="关闭" className="icon-button" onClick={onClose}><Icon name="close"/></button></header>
    <div className="sheet-body">{children}</div>{footer ? <footer className="sheet-footer">{footer}</footer> : null}
  </section></div>;
}
export function Confirm({ title, children, action = '确认', onConfirm, onClose, busy = false, danger = false }) {
  return <Sheet title={title} onClose={busy ? () => {} : onClose} footer={<><button disabled={busy} onClick={onClose}>取消</button><button className={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : action}</button></>}><div className="confirm-copy">{children}</div></Sheet>;
}
export function Empty({ title = '没有匹配的单词', children }) { return <div className="empty"><h2>{title}</h2>{children}</div>; }
export function BottomNav({ tab, onChange }) { return <nav className="bottom-nav" aria-label="主要导航">{[['wall', 'book', '词库'], ['review', 'history', '复习'], ['settings', 'settings', '设置']].map(([id, icon, text]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => onChange(id)}><Icon name={icon} size={25}/><span>{text}</span></button>)}</nav>; }
export function Pager({ page, pages, onChange, count }) { return <nav className="pager" aria-label="单词分页"><button disabled={page === 0} onClick={() => onChange(page - 1)}>上一页</button><span>{page + 1} / {pages}<small>{count} 张卡片</small></span><button disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>下一页</button></nav>; }
