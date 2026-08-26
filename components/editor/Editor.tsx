'use client';

import { useEffect, useRef, useState } from 'react';
import { savePoster } from '@/actions/save-poster';
import {
  AVAILABLE_MODES,
  DENSITIES,
  GRAIN_LEVELS,
  MAX_SEED,
  MODES,
  type PosterParams,
  type PosterSpec,
} from '@/lib/poster/types';
import { specToSearchParams } from '@/lib/poster/url';
import {
  splitWords,
  validateParams,
  validatePhrase,
  type ValidationIssue,
} from '@/lib/poster/validate';
import { Preview } from './Preview';

export interface EditorProps {
  readonly initialSpec: PosterSpec;
  readonly initialSvg: string;
}

const DEBOUNCE_MS = 300;

function writeUrl(spec: PosterSpec) {
  const qs = specToSearchParams(spec).toString();
  window.history.replaceState(null, '', qs ? `/create?${qs}` : '/create');
}

export function Editor({ initialSpec, initialSvg }: EditorProps) {
  const [spec, setSpec] = useState<PosterSpec>(initialSpec);
  const [saveIssues, setSaveIssues] = useState<readonly ValidationIssue[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Ref, not a boolean flag: React Strict Mode double-invokes the mount
  // effect in dev, and a flip-once boolean does not survive that second
  // call. Comparing against the original spec value does, since it stays
  // true on every mount-time invocation and only turns false once `spec`
  // has actually been replaced by a real edit.
  const initialSpecRef = useRef(initialSpec);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);

  useEffect(() => {
    if (spec === initialSpecRef.current) return;

    debounceTimer.current = setTimeout(() => writeUrl(spec), DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [spec]);

  function updateParams(patch: Partial<PosterParams>) {
    setSpec((s) => ({ ...s, params: { ...s.params, ...patch } }));
  }

  function handlePhraseChange(value: string) {
    setSpec((s) => {
      const wordCount = splitWords(value).length;
      const accent = s.params.accent !== null && s.params.accent >= wordCount ? null : s.params.accent;
      return { phrase: value, params: { ...s.params, accent } };
    });
  }

  async function handleSave() {
    // Synchronous guard: setIsSaving below only reaches the DOM on the next
    // render, so a second click arriving before that commit would still see
    // a non-disabled button. savingRef is set before any await, so it blocks
    // the second call in the same tick, ahead of React's state update.
    if (savingRef.current) return;
    savingRef.current = true;

    clearTimeout(debounceTimer.current);
    writeUrl(spec);
    setSaveIssues([]);
    setIsSaving(true);
    const result = await savePoster(spec.phrase, spec.params);
    if (!result.ok) {
      setSaveIssues(result.issues);
      setIsSaving(false);
      savingRef.current = false;
    }
  }

  const words = splitWords(spec.phrase);
  const wordCount = words.length;
  const phraseResult = validatePhrase(spec.phrase);
  const paramsResult = validateParams(spec.params, wordCount);
  const liveIssues: readonly ValidationIssue[] = [
    ...(phraseResult.ok ? [] : phraseResult.issues),
    ...(paramsResult.ok ? [] : paramsResult.issues),
  ];
  const validSpec = liveIssues.length === 0 ? spec : null;
  const displayedIssues = liveIssues.length > 0 ? liveIssues : saveIssues;

  return (
    <div className="flex w-full max-w-4xl gap-8">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span>Phrase</span>
          <textarea
            className="border p-2"
            value={spec.phrase}
            onChange={(e) => handlePhraseChange(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend>Mode</legend>
          {MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={spec.params.mode === mode}
                disabled={!(AVAILABLE_MODES as readonly string[]).includes(mode)}
                onChange={() => updateParams({ mode })}
              />
              {mode}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend>Density</legend>
          {DENSITIES.map((density) => (
            <label key={density} className="flex items-center gap-2">
              <input
                type="radio"
                name="density"
                value={density}
                checked={spec.params.density === density}
                onChange={() => updateParams({ density })}
              />
              {density}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend>Grain</legend>
          {GRAIN_LEVELS.map((grain) => (
            <label key={grain} className="flex items-center gap-2">
              <input
                type="radio"
                name="grain"
                value={grain}
                checked={spec.params.grain === grain}
                onChange={() => updateParams({ grain })}
              />
              {grain}
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={spec.params.invert}
            onChange={(e) => updateParams({ invert: e.target.checked })}
          />
          Invert
        </label>

        <label className="flex flex-col gap-1">
          <span>Accent word</span>
          <select
            value={spec.params.accent ?? ''}
            onChange={(e) =>
              updateParams({ accent: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">None</option>
            {words.map((word, i) => (
              <option key={i} value={i}>
                {word}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => updateParams({ seed: Math.floor(Math.random() * (MAX_SEED + 1)) })}
        >
          New random seed
        </button>

        <button type="button" disabled={isSaving} onClick={() => void handleSave()}>
          Save
        </button>

        {displayedIssues.length > 0 && (
          <ul className="text-red-600">
            {displayedIssues.map((issue, i) => (
              <li key={i}>
                {issue.field}: {issue.code}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Preview spec={validSpec} initialSvg={initialSvg} />
    </div>
  );
}
