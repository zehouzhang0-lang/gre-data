const dev = import.meta.env?.DEV;
const noop = () => {};
let interactionId = 0;

export function startInteraction(name, startTime) {
  if (!dev) return noop;
  const label = `gre:${name}`;
  const startMark = `${label}:${++interactionId}:start`;
  const { startTime: start } = performance.mark(startMark, { startTime });
  performance.clearMarks(startMark);
  return phase => {
    const endMark = `${startMark}:${phase}`;
    performance.mark(endMark);
    performance.measure(`${label}:${phase}`, { start, end: endMark });
    performance.clearMarks(endMark);
  };
}

export function afterInteractionPaint() {
  return new Promise(resolve => {
    let frame;
    const done = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      resolve();
    };
    // A backgrounded WebView can pause animation callbacks before the write starts.
    const timeout = setTimeout(done, 100);
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(done); });
  });
}
