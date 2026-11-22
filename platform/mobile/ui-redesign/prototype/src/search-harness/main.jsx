// Measurement harness: the production word wall, fed a synthetic library.
//
//   /search-harness.html?words=5000&variant=original
//   /search-harness.html?words=5000&variant=candidate
//
// `original` is platform/mobile/src/components/WordWall.jsx exactly as it is.
// `candidate` is ui-redesign/search/WordWall.candidate.jsx: the same component with the
// search changes proposed in ui-redesign/search/README.md.
// The repository object is a stub that saves nothing; the wall's own view preferences go
// to this origin's localStorage under a synthetic dataset id.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '../../../../src/design-tokens.css';
import '../../../../src/mobile.css';
import { makeState } from '../../../search/synthetic-state.mjs';

const params = new URLSearchParams(location.search);
const variant = params.get('variant') === 'candidate' ? 'candidate' : 'original';
const words = Math.max(0, Number(params.get('words')) || 5000);

const { default: WordWall } = variant === 'candidate'
  ? await import('../../../search/WordWall.candidate.jsx')
  : await import('../../../../src/components/WordWall.jsx');

const state = { ...makeState(words, 100 + words), datasetId: `synthetic-${words}`, settings: {}, events: [], quickRound: null, undoId: null };
const repo = new Proxy({}, { get: () => async () => ({ added: 0 }) });
const nothing = () => {};

function Harness() {
  return (
    <div className="app-shell" style={{ height: '100dvh' }}>
      <WordWall state={state} repo={repo} busy={false} active mutate={async operation => { await operation(); return true; }} notify={nothing} onSelectionMode={nothing} onStartReview={nothing} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
window.harness = { variant, words };
