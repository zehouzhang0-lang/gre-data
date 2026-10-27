import { capturedWord } from '../../../shared/capture-word.mjs';

// Browsing is positional. Completion is only used by the explicit recommendation.
export function adjacentQuestion(questions, key, direction) {
  const index = questions.findIndex(question => question.key === key);
  return index < 0 ? null : questions[index + direction] || null;
}

export function swipeDirection(start, end, { selection = false, enabled = true } = {}) {
  if (!enabled || !start || selection || start.cancelled || !['touch', 'pen'].includes(start.pointerType)) return 0;
  const dx = end.x - start.x, dy = end.y - start.y, elapsed = end.time - start.time;
  if (elapsed < 0 || elapsed > 450 || Math.abs(dx) < 64 || Math.abs(dx) <= Math.abs(dy) * 1.6) return 0;
  return dx < 0 ? 1 : -1;
}

export function captureSelection(selection, container, question) {
  if (!selection || selection.isCollapsed || !selection.rangeCount || !container || !question) return null;
  const range = selection.getRangeAt(0);
  const elementOf = node => node?.nodeType === 1 ? node : node?.parentElement;
  const start = elementOf(range.startContainer)?.closest('[data-capture-text]');
  const end = elementOf(range.endContainer)?.closest('[data-capture-text]');
  if (!start || start !== end || !container.contains(start)) return null;
  let word;
  try { word = capturedWord(selection.toString()); } catch { return null; }
  const text = start.textContent.replace(/\s+/g, ' ').trim();
  const location = text.toLowerCase().indexOf(selection.toString().trim().toLowerCase());
  const context = text.slice(Math.max(0, location - 90), Math.max(0, location - 90) + 240);
  return { word, source: { material: question.material, unit: question.unit, question: String(question.question), type: question.type }, context };
}
