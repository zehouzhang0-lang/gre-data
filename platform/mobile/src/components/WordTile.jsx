import { memo, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { wordRating, ratingLabels } from '../model.mjs';
import { Icon } from './Primitives';
import '../word-tile-c.css';

const wordWidths = new Map();
const fontListeners = new Set();
let measureNode;
let fontRequested = false, fontVersion = 0;
let resizeObserver;
let motionQuery;
const sizeListeners = new WeakMap();

function subscribeFont(listener) {
  fontListeners.add(listener);
  if (!fontRequested && document.fonts) {
    fontRequested = true;
    document.fonts.load('500 15px "Source Serif 4"').then(() => {
      wordWidths.clear();
      fontVersion++;
      fontListeners.forEach(update => update());
    }, () => {});
  }
  return () => fontListeners.delete(listener);
}
const fontSnapshot = () => fontVersion;
const initialFont = () => 0;

function queriesReducedMotion() {
  motionQuery ||= globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  return motionQuery;
}
function subscribeMotion(listener) {
  const query = queriesReducedMotion();
  query?.addEventListener?.('change', listener);
  return () => query?.removeEventListener?.('change', listener);
}
const reducedMotion = () => !!queriesReducedMotion()?.matches;
const noServerMotion = () => true;

function observeTile(node, update) {
  if (!globalThis.ResizeObserver) return;
  resizeObserver ||= new ResizeObserver(changes => {
    for (const { target, contentRect } of changes) sizeListeners.get(target)?.(contentRect.width, contentRect.height);
  });
  sizeListeners.set(node, update);
  resizeObserver.observe(node);
  return () => {
    resizeObserver.unobserve(node);
    sizeListeners.delete(node);
  };
}

function measuredWidth(text, size) {
  const key = `${size}:${text}`;
  if (wordWidths.has(key)) return wordWidths.get(key);
  if (!measureNode) {
    const measureBox = document.createElement('div');
    measureBox.className = 'candidate-wall wall-tile-measure';
    measureBox.setAttribute('aria-hidden', 'true');
    measureNode = document.createElement('span');
    measureNode.className = 'tile-word';
    measureNode.lang = 'en';
    measureBox.append(measureNode);
    document.body.append(measureBox);
  }
  measureNode.style.fontSize = `${size}px`;
  measureNode.textContent = text;
  const width = measureNode.getBoundingClientRect().width;
  if (wordWidths.size >= 2048) wordWidths.delete(wordWidths.keys().next().value);
  wordWidths.set(key, width);
  return width;
}

const vowel = letter => /[aeiouy]/i.test(letter || '');
function wrapWord(text) {
  const middle = Math.round(text.length / 2);
  const canBreak = i => i > 1 && i < text.length - 1
    && /[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(text.slice(0, i))
    && /[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(text.slice(i));
  const closest = (distance, matches) => {
    for (let offset = 0; offset <= distance; offset++) {
      for (const i of [middle - offset, middle + offset]) {
        if (canBreak(i) && matches(i)) return i;
      }
    }
    return 0;
  };
  const boundary = closest(middle, i => /[\s\-]/.test(text[i - 1]));
  if (boundary) return `${text.slice(0, boundary).trimEnd()}\n${text.slice(boundary).trimStart()}`;
  const consonants = closest(2, i => vowel(text[i - 2]) && !vowel(text[i - 1]) && !vowel(text[i]) && vowel(text[i + 1]));
  const afterVowel = closest(middle, i => vowel(text[i - 1]) && !vowel(text[i]) && vowel(text[i + 1]));
  const at = consonants || afterVowel || closest(middle, () => true);
  return at ? `${text.slice(0, at)}-\n${text.slice(at)}` : text;
}

function fitWord(text, width, maxFont) {
  const max = Math.max(12, Math.min(22, Number(maxFont) || 15));
  const sizes = [max];
  for (let size = Math.ceil(max) - 1; size >= 12; size--) sizes.push(size);
  const available = Math.max(12, width - 10);
  const fit = sizes.find(size => measuredWidth(text, size) <= available);
  if (fit) return { text, size: fit };
  const broken = wrapWord(text);
  const wrappedFit = sizes.find(size => measuredWidth(broken, size) <= available);
  if (wrappedFit) return { text: broken, size: wrappedFit };
  // Scale the intact lines if neither the word nor a balanced split fits at 12px.
  return { text: broken, size: 12, scale: available / measuredWidth(broken, 12) };
}

function fitMeaning(text, width, height, hasPos, hasDetail) {
  const senses = (text || '').split(/\s*[；;\n]\s*/u).map(sense => sense.trim()).filter(Boolean);
  if (!senses.length) senses.push('待补释义');
  const room = height - 22 - (hasPos ? 13 : 0) - (hasDetail ? 5 : 0);
  for (const size of [13, 12, 11]) {
    const perLine = Math.max(1, Math.floor((width - 10) / size));
    const lines = senses.flatMap(sense => {
      const chars = [...sense];
      const count = Math.max(1, Math.ceil(chars.length / perLine));
      return Array.from({ length: count }, (_, i) => chars.slice(Math.round(chars.length * i / count), Math.round(chars.length * (i + 1) / count)).join(''));
    });
    const capacity = Math.max(1, Math.floor(room / (size * 1.35)));
    if (size !== 11 && (lines.length !== senses.length || lines.length > capacity)) continue;
    const shown = lines.slice(0, capacity);
    if (lines.length > capacity) shown[capacity - 1] = `${[...shown[capacity - 1]].slice(0, -1).join('')}…`;
    return { text: shown.join('\n'), size };
  }
}

export function WallMark({ rating, swatch = false }) {
  if (swatch) return <span className="wall-mark wall-mark-swatch" data-rating={rating} aria-hidden="true"/>;
  return <svg className="wall-mark" data-rating={rating} width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
    {rating === 'remembered'
      ? <circle cx="4.5" cy="4.5" r="4.5" fill="currentColor"/>
      : <circle cx="4.5" cy="4.5" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={rating === 'unrated' ? '1.6 1.6' : undefined}/>}
    {rating === 'partial' && <path d="M4.5 0A4.5 4.5 0 0 0 4.5 9Z" fill="currentColor"/>}
  </svg>;
}

export default memo(function WordTile({
  entry, word, rating = wordRating(word), selected, flipped, selecting, multiTouchGeneration,
  onFlip, onSelect, onDetail, maxFont = 15, look = 'pip',
  managedGestures = false, preview = false, held = false,
}) {
  const article = useRef(null), inner = useRef(null), front = useRef(null);
  const gesture = useRef(null), timer = useRef(null), suppress = useRef(false);
  const lastRating = useRef(rating);
  const rated = rating !== 'unrated';
  const fillBack = look === 'fill' && rated;
  const [box, setBox] = useState({ width: 88, height: 88 });
  const [wordFit, setWordFit] = useState(null);
  const [resting, setResting] = useState(flipped);
  const statusId = useId();
  const fontRevision = useSyncExternalStore(subscribeFont, fontSnapshot, initialFont);
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, noServerMotion);
  const turning = !preview && !still && resting !== flipped;
  const showDetail = flipped && !selecting;

  useLayoutEffect(() => {
    const node = article.current;
    function update(width, height) {
      if (width < 1 || height < 1) return;
      setBox(size => size.width === width && size.height === height ? size : { width, height });
    }
    const rect = node.getBoundingClientRect();
    update(rect.width, rect.height);
    return observeTile(node, update);
  }, []);

  useLayoutEffect(() => {
    setWordFit(fitWord(word.word, box.width, maxFont));
  }, [word.word, box.width, maxFont, fontRevision]);

  useLayoutEffect(() => {
    if (!turning || !inner.current.animate) {
      if (resting !== flipped) setResting(flipped);
      return;
    }
    const angle = flipped ? [0, 180] : [180, 0];
    const animation = inner.current.animate(
      angle.map(degrees => ({ transform: `rotateY(${degrees}deg)` })),
      { duration: 280, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' },
    );
    animation.onfinish = () => setResting(flipped);
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [flipped, resting, turning]);

  useLayoutEffect(() => {
    const previous = lastRating.current;
    lastRating.current = rating;
    if (previous === rating || preview || still || look !== 'pip' || rating === 'unrated') return;
    const mark = front.current?.querySelector('.wall-mark');
    const frames = [{ transform: 'scale(.2)' }, { transform: 'scale(1.9)', offset: .45 }, { transform: 'none' }];
    const animation = mark?.animate?.(frames, { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1)' });
    return () => animation?.cancel();
  }, [look, preview, rating, still]);

  const stop = () => { clearTimeout(timer.current); timer.current = null; };
  const release = () => { stop(); article.current?.removeAttribute('data-pressed'); };
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  function down(event) {
    if (managedGestures || event.button !== 0 || event.isPrimary === false) return;
    article.current?.setAttribute('data-pressed', '');
    suppress.current = false;
    gesture.current = { x: event.clientX, y: event.clientY };
    if (selecting) return;
    const generation = multiTouchGeneration?.current;
    timer.current = setTimeout(() => {
      if (generation !== multiTouchGeneration?.current) return;
      suppress.current = true;
    }, 400);
  }
  function move(event) {
    if (!gesture.current) return;
    if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 8) {
      release();
      suppress.current = true;
    }
  }
  function cancel() {
    release();
    suppress.current = true;
    gesture.current = null;
  }
  function click(event) {
    stop();
    gesture.current = null;
    if (suppress.current && event.detail > 0) {
      suppress.current = false;
      event.preventDefault();
      return;
    }
    if (preview) return;
    if (selecting) onSelect(word.word);
    else onFlip(word.word);
  }

  const english = (turning || !flipped) && (wordFit ?? { text: word.word, size: maxFont });
  const chinese = (turning || flipped) && fitMeaning(word.meaning, box.width, box.height, !!word.pos, showDetail);
  const localPress = managedGestures || preview ? {} : {
    onPointerDown: down, onPointerMove: move, onPointerUp: release,
    onPointerCancel: cancel, onPointerLeave: release,
  };
  return <article ref={article} className={`word-tile rated-${rating}${selected ? ' selected' : ''}${flipped ? ' flipped' : ''}${turning ? ' turning' : ''}${held ? ' held' : ''}`} data-word={word.word} data-group={entry.group?.id || ''}>
    <button type="button" className="tile-face" tabIndex={preview ? -1 : undefined}
      aria-label={`${word.word} · ${selecting ? '选择' : flipped ? '翻回英文' : '翻看释义'}`}
      aria-describedby={preview ? undefined : statusId} aria-pressed={selecting ? selected : flipped}
      {...localPress} onContextMenu={e => e.preventDefault()} onClick={preview ? undefined : click}>
      <span className="wall-tile-inner" ref={inner}>
        {english && <span ref={front} className="wall-tile-side wall-tile-front" aria-hidden={flipped || undefined}>
          {look === 'pip' && rated && <WallMark rating={rating}/>}
          <span lang="en" className="tile-word" style={{ fontSize: english.size, transform: english.scale ? `scale(${english.scale})` : undefined }}>{english.text}</span>
        </span>}
        {chinese && <span className={`wall-tile-side wall-tile-back${fillBack ? ' wall-tile-fill' : ''}`} data-rating={fillBack ? rating : undefined} aria-hidden={!flipped || undefined}>
          {look === 'pip' && rated && <WallMark rating={rating}/>}
          <span className="wall-tile-translation">
            {word.pos && <span className="wall-tile-pos">{word.pos}</span>}
            <span className="tile-meaning" style={{ fontSize: chinese.size }}>{chinese.text}</span>
          </span>
        </span>}
      </span>
      <span className="wall-tile-check" hidden={!selected} aria-hidden="true">✓</span>
    </button>
    {!preview && <span id={statusId} className="sr-only">记忆状态：{ratingLabels[rating] || '未标记'}</span>}
    {showDetail && <button type="button" className={`tile-detail${fillBack ? ' on-filled-face' : ''}`} tabIndex={preview ? -1 : undefined} aria-label={`查看 ${word.word} 完整释义`} onClick={preview ? undefined : () => onDetail(word.word)}><Icon name="more" size={16}/></button>}
  </article>;
});
