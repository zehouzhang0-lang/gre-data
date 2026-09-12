import { cloneElement, useEffect, useId, useRef } from "react";
import {
  BookOpen,
  FileText,
  GalleryVerticalEnd,
  ChartNoAxesColumnIncreasing,
  Upload,
  RefreshCw,
  Search,
  Plus,
  FolderOpen,
  ArrowRight,
} from "lucide-react";
export function Icon({ name, size = 20 }) {
  const Component =
    {
      book: BookOpen,
      file: FileText,
      cards: GalleryVerticalEnd,
      history: ChartNoAxesColumnIncreasing,
      upload: Upload,
      sync: RefreshCw,
      search: Search,
      plus: Plus,
      folder: FolderOpen,
      arrow: ArrowRight,
    }[name] || FileText;
  return <Component size={size} strokeWidth={1.65} aria-hidden="true" />;
}
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({ title, children, icon = "file" }) {
  return (
    <div className="empty">
      <Icon name={icon} size={44} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Field({ label, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function Header({ title, description, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{children}</div>
    </header>
  );
}
