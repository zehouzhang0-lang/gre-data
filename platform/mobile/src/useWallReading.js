import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { dayKey } from '../../server/spaced-review.mjs';
import { createCardReadingDraft } from './card-reading-draft.mjs';
import { wordRating } from './model.mjs';

function loadJournal(key) {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(key));
    return { draft: createCardReadingDraft(undefined, saved), day: saved?.day, retry: saved?.retry === true };
  } catch {
    return { draft: createCardReadingDraft() };
  }
}

function saveJournal(key, journal) {
  const { draft, day, retry } = journal;
  const snapshot = draft.snapshot();
  try {
    if (snapshot.pending.length || retry) globalThis.localStorage.setItem(key, JSON.stringify({ ...snapshot, day, retry }));
    else globalThis.localStorage.removeItem(key);
  } catch {
    // The in-memory draft still survives until the current app instance closes.
  }
}

function hasRoundRatings(state) {
  const id = state.quickRound?.id;
  return !!id && state.events?.some(event => event.kind === 'vocab_quick_review' && (event.payload?.session_id || event.session_id) === id);
}

export function useWallReading({ state, repo, busy, mutate, onSaved }) {
  const key = 'gre-wall-readings:v1:' + state.datasetId;
  const journalRef = useRef(null);
  if (!journalRef.current) journalRef.current = loadJournal(key);
  const journal = journalRef.current;
  const latest = useRef({ state, busy, repo, mutate, onSaved });
  const requested = useRef(null), writing = useRef(false);
  useLayoutEffect(() => { latest.current = { state, busy, repo, mutate, onSaved }; });

  const flush = useCallback(async () => {
    const current = latest.current;
    if (requested.current === null || current.busy || writing.current) return;
    const background = requested.current;
    requested.current = null;
    const today = dayKey(new Date(), current.state.timeZone);
    const ratings = hasRoundRatings(current.state);
    const previousDay = (journal.day && journal.day < today) || (ratings && current.state.quickRound.day < today);
    if (!background && !journal.retry && !previousDay) return;
    if (!journal.draft.hasPending() && !ratings && !journal.retry) return;

    writing.current = true;
    journal.retry = true;
    saveJournal(key, journal);
    let finished = false;
    try {
      const success = await current.mutate(async () => {
        const savedState = await current.repo.getState();
        // A process can be suspended after the repository committed and before the
        // journal was cleared. Acknowledge those frozen batches before trying again.
        journal.draft.commitSaved(new Set(savedState.events?.filter(event => event.kind === 'vocab_card_reading').map(event => event.id)));
        const words = new Map(savedState.vocabulary.filter(word => !word.deleted).map(word => [word.word, word]));
        const batches = journal.draft.prepareAll(word => {
          const rating = wordRating(words.get(word));
          return rating === 'unrated' ? null : rating;
        }, word => words.has(word));
        if (!batches.length && !hasRoundRatings(savedState)) return;
        saveJournal(key, journal);
        await current.repo.finishWallRound({ batches, expectedRoundId: savedState.quickRound?.id });
        journal.draft.commitAll();
        finished = true;
      }, undefined, { quiet: true });
      if (!success) return;
      journal.retry = false;
      if (!journal.draft.hasPending()) journal.day = null;
      saveJournal(key, journal);
      if (finished) current.onSaved();
    } finally {
      writing.current = false;
    }
  }, [journal, key]);

  useEffect(() => { void flush(); }, [busy, flush]);
  useEffect(() => {
    let disposed = false, nativeListener;
    const request = background => {
      if (disposed || writing.current) return;
      requested.current = background || requested.current || false;
      // A pending UI write owns the repository, but Android can suspend the
      // process before it releases the guard. Preserve this flush request too.
      if (background && latest.current.busy) {
        journal.retry = true;
        saveJournal(key, journal);
      }
      void flush();
    };
    const hide = () => request(true);
    const visibility = () => request(document.hidden);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', visibility);
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => request(!isActive)).then(listener => {
        if (disposed) void listener.remove();
        else nativeListener = listener;
      }).catch(() => { /* WebView visibility remains available. */ });
    }
    request(false);
    return () => {
      disposed = true;
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visibility);
      void nativeListener?.remove();
    };
  }, [flush, journal, key]);

  return useCallback(word => {
    const now = new Date();
    journal.day ||= dayKey(now, state.timeZone);
    journal.draft.record(word, now.toISOString());
    saveJournal(key, journal);
  }, [journal, key, state.timeZone]);
}
