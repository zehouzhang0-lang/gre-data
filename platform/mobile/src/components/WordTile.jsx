import { memo, useEffect, useRef } from 'react';
import { wordRating, ratingLabels } from '../model.mjs';
import { Icon } from './Primitives';

export default memo(function WordTile({ entry, word, selected, flipped, selecting, busy, onFlip, onSelect, onLongPress, onDetail }) {
  const gesture = useRef(null), timer = useRef(null), suppress = useRef(false);
  const stop = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => clearTimeout(timer.current), []);
  const rating = wordRating(word);
  function down(event) {
    if (event.button !== 0 || busy) return;
    suppress.current = false;
    gesture.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => { suppress.current = true; onLongPress(word.word); }, 450);
  }
  function move(event) {
    if (!gesture.current) return;
    if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 8) { stop(); suppress.current = true; }
  }
  function click(event) {
    stop(); gesture.current = null;
    if (suppress.current) { suppress.current = false; event.preventDefault(); return; }
    if (busy) return;
    if (selecting) onSelect(word.word); else onFlip(word.word);
  }
  return <article className={`word-tile rated-${rating} ${selected ? 'selected' : ''} ${flipped ? 'flipped' : ''}`} data-word={word.word} data-group={entry.group?.id || ''}>
    <button className="tile-face" disabled={busy} aria-label={`${word.word} · ${selecting ? '选择' : flipped ? '翻回英文' : '翻看释义'}`} aria-pressed={selecting ? selected : flipped}
      onPointerDown={down} onPointerMove={move} onPointerUp={stop} onPointerCancel={() => { stop(); suppress.current = true; gesture.current = null; }}
      onPointerLeave={stop} onContextMenu={e => e.preventDefault()} onClick={click}>
      {flipped ? <span className="tile-meaning">{word.pos} {word.meaning || '待补释义'}</span> : <span lang="en" className="tile-word">{word.word}</span>}
      {rating !== 'unrated' && <span className="sr-only">{ratingLabels[rating]}</span>}
    </button>
    {flipped && !selecting && <button className="tile-detail" aria-label={`查看 ${word.word} 完整释义`} onClick={() => onDetail(word.word)}><Icon name="more" size={16}/></button>}
  </article>;
});
