import { useLayoutEffect } from 'react';
import './search-keyboard-overlay.css';

const overlayInput = 'input[data-keyboard="overlay"]';
const otherInput = 'input, textarea, select';

export function useSearchKeyboardOverlay() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const height = () => Math.min(window.innerHeight, viewport?.height ?? window.innerHeight);
    let frozen;
    let timeout;

    function release() {
      clearTimeout(timeout);
      if (!frozen) return;
      const { shell, previous } = frozen;
      for (const [property, value, priority] of previous) {
        if (value) shell.style.setProperty(property, value, priority);
        else shell.style.removeProperty(property);
      }
      root.removeAttribute('data-search-keyboard-frozen');
      frozen = undefined;
    }

    function freeze(input) {
      const shell = input.closest('.app-shell');
      if (!shell) return;
      clearTimeout(timeout);
      if (frozen?.input === input) {
        frozen.blurred = false;
        return;
      }
      release();
      const shellHeight = shell.getBoundingClientRect().height;
      // Read used inset lengths even when the CSS variables use env() or calc().
      const probe = document.createElement('span');
      probe.className = 'search-keyboard-inset-probe';
      shell.append(probe);
      const { paddingTop, paddingBottom } = getComputedStyle(probe);
      probe.remove();
      const properties = [['height', `${shellHeight}px`], ['--safe-top', paddingTop], ['--safe-bottom', paddingBottom]];
      const previous = properties.map(([name]) => [name, shell.style.getPropertyValue(name), shell.style.getPropertyPriority(name)]);
      frozen = { input, shell, previous, width: window.innerWidth, height: height(), shrank: false, blurred: false };
      for (const [name, value] of properties) shell.style.setProperty(name, value);
      root.setAttribute('data-search-keyboard-frozen', '');
    }

    function resized() {
      if (!frozen) return;
      if (window.innerWidth !== frozen.width) {
        const input = frozen.input;
        release();
        if (document.activeElement === input) freeze(input);
        return;
      }
      if (height() < frozen.height - 1) frozen.shrank = true;
      else if (frozen.blurred && frozen.shrank) release();
    }

    function onFocusIn({ target }) {
      if (target.matches(overlayInput)) freeze(target);
      else if (frozen && (target.isContentEditable || target.matches(otherInput))) release();
    }

    function onFocusOut({ target }) {
      if (frozen?.input !== target) return;
      frozen.blurred = true;
      if (frozen.shrank && height() >= frozen.height - 1) release();
      else timeout = setTimeout(release, 500);
    }

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('resize', resized);
    viewport?.addEventListener('resize', resized);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('resize', resized);
      viewport?.removeEventListener('resize', resized);
      release();
    };
  }, []);
}
