'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { savePoster, type SavePosterResult } from '@/actions/save-poster';
import {
  AVAILABLE_MODES,
  DENSITIES,
  GRAIN_LEVELS,
  MAX_CHARS,
  MAX_SEED,
  MAX_WORDS,
  MIN_WORDS,
  MODES,
  PARAMS_VERSION,
  type Density,
  type GrainLevel,
  type PosterParams,
  type PosterSpec,
} from '@/lib/poster/types';
import { editorHref, searchParamsToSpec } from '@/lib/poster/url';
import {
  normalizePhrase,
  splitWords,
  validateParams,
  validatePhrase,
  type ValidationIssue,
} from '@/lib/poster/validate';
import { RANDOM_PHRASES } from './random-phrases';
import { ModeIcon } from './ModeIcon';
import { SegmentedControl } from './SegmentedControl';
import { Toggle } from './Toggle';
import { Preview } from './Preview';

export interface EditorProps {
  readonly initialSpec: PosterSpec;
  readonly initialSvg: string;
}

const DEBOUNCE_MS = 300;

const RATE_LIMIT_MESSAGE = 'Too many saves in a row. Wait a minute and try again.';

// Shown when the request never got an answer - the action threw rather than
// returning a refusal. Phrased as something to retry, since nothing about the
// poster is wrong.
const SAVE_FAILED_MESSAGE = 'Could not reach the server. Check your connection and try again.';

const MODE_LABELS: Record<(typeof MODES)[number], string> = {
  stack: 'Stack',
  break: 'Break',
  grid: 'Grid',
  column: 'Column',
  ring: 'Ring',
};

const DENSITY_LABELS: Record<Density, string> = {
  tight: 'Tight',
  regular: 'Regular',
  airy: 'Airy',
};

const GRAIN_LABELS: Record<GrainLevel, string> = {
  0: 'None',
  1: 'Light',
  2: 'Medium',
  3: 'Heavy',
};

function writeUrl(spec: PosterSpec) {
  window.history.replaceState(null, '', editorHref(spec));
}

// Returning from a saved poster with the back button restores the address
// writeUrl left behind, but remounts the editor with whichever server payload
// the Router Cache holds for /create - usually the one rendered for the bare
// entry, whose spec is the default. Measured: address
// /create?phrase=BACK+BUTTON+TEST+PHRASE, textarea "the poster starts here".
// The address is the reliable half, so it wins on mount. Reading it costs no
// network request, unlike the router.replace this project rejected in 6.4.
//
// Except on a forward link into the editor (Edit this poster, Open in
// editor): the router renders the new page before it pushes the new address,
// so at mount window.location still shows the page being left. Measured:
// /p/hyb7985u -> /create?phrase=HALF+THE+CITY... mounted the default spec.
// There the server spec is the fresh one - it was rendered for exactly this
// address - so it is the one to trust whenever the address is not /create yet.
function specFromAddress(serverSpec: PosterSpec): PosterSpec {
  if (typeof window === 'undefined') return serverSpec;
  if (window.location.pathname !== '/create') return serverSpec;
  return searchParamsToSpec(new URLSearchParams(window.location.search));
}

// Plain-English copy for every ValidationIssue lib/poster/validate.ts can
// produce. validate.ts itself only returns {field, code} pairs - this is
// the sole place that turns them into text, so lib/poster stays free of UI copy.
function describeIssue(issue: ValidationIssue): string {
  if (issue.field === 'phrase') {
    if (issue.code === 'too_few_words') return `Add more words: a phrase needs at least ${MIN_WORDS}.`;
    if (issue.code === 'too_many_words') return `Too many words: ${MAX_WORDS} at most.`;
    if (issue.code === 'unsupported_chars') return `The typeface has no glyph for: ${issue.chars.join(' ')}`;
    return `Too long: ${MAX_CHARS} characters at most.`; // remaining case: too_long
  }
  if (issue.field === 'layout') return "This phrase doesn't fit this mode at this density. Try another mode or density.";
  if (issue.field === 'mode') return 'This mode is not available yet.';
  if (issue.field === 'accent') return "Accent word must be one of the phrase's words.";
  // remaining case: issue.field === 'seed'
  if (issue.code === 'seed_not_integer') return 'Seed must be a whole number.';
  return `Seed must be between 0 and ${MAX_SEED.toLocaleString('en-US')}.`; // remaining case: seed_out_of_range
}

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function pick<T>(items: readonly T[]): T {
  return items[randomIndex(items.length)];
}

// Math.random is banned inside lib/poster, where a poster has to come out the
// same every time it is rendered. Here it runs once per click, in the browser,
// and its result is written into the spec as a fixed seed - so the poster the
// button produces is as reproducible as any other.
function randomSpec(): PosterSpec {
  const phrase = pick(RANDOM_PHRASES);
  // Drawn after the phrase, never before: accent is an index into that
  // phrase's own words, and one left over from the previous phrase would fail
  // validateParams with accent_out_of_range. The extra slot is "no accent".
  const wordCount = splitWords(phrase).length;
  const accentSlot = randomIndex(wordCount + 1);

  return {
    phrase,
    params: {
      v: PARAMS_VERSION,
      mode: pick(AVAILABLE_MODES),
      invert: Math.random() < 0.5,
      accent: accentSlot === wordCount ? null : accentSlot,
      density: pick(DENSITIES),
      grain: pick(GRAIN_LEVELS),
      seed: randomIndex(MAX_SEED + 1),
    },
  };
}

export function Editor({ initialSpec, initialSvg }: EditorProps) {
  const [spec, setSpec] = useState<PosterSpec>(() => specFromAddress(initialSpec));
  const [saveMessages, setSaveMessages] = useState<readonly string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Reported by Preview, the only place the renderer is loaded. Starts true:
  // until the renderer arrives there is nothing to say otherwise.
  const [layoutFits, setLayoutFits] = useState(true);

  const id = useId();
  const ids = {
    phrase: `${id}-phrase`,
    phraseHint: `${id}-phrase-hint`,
    phraseCount: `${id}-phrase-count`,
    phraseError: `${id}-phrase-error`,
    stale: `${id}-stale`,
    modeLabel: `${id}-mode-label`,
    modeHint: `${id}-mode-hint`,
    densityLabel: `${id}-density-label`,
    densityHint: `${id}-density-hint`,
    grainLabel: `${id}-grain-label`,
    grainHint: `${id}-grain-hint`,
    invertLabel: `${id}-invert-label`,
    invertHint: `${id}-invert-hint`,
    accent: `${id}-accent`,
    accentHint: `${id}-accent-hint`,
    saveNote: `${id}-save-note`,
  };
  const phraseRef = useRef<HTMLTextAreaElement>(null);

  // The textarea holds exactly what was typed or pasted; everything below it -
  // the preview, the accent list, the address and Save - works on the
  // normalized phrase, which is the precise string savePoster stores. Without
  // this an invisible character (a soft hyphen out of a PDF, a zero-width
  // space off a web page) reached the renderer, which has no glyph for it, and
  // the editor reported a layout failure for a phrase that saves fine.
  // Normalizing the textarea value itself is not an option: normalizePhrase
  // trims, so the space that starts a new word would vanish as it is typed.
  // Memoized to keep a stable identity - Preview compares its spec by
  // reference and would otherwise redraw on every unrelated parent render.
  const normalizedSpec = useMemo<PosterSpec>(
    () => ({ phrase: normalizePhrase(spec.phrase), params: spec.params }),
    [spec.phrase, spec.params],
  );

  // Ref, not a boolean flag: React Strict Mode double-invokes the mount
  // effect in dev, and a flip-once boolean does not survive that second
  // call. Comparing against the original spec value does, since it stays
  // true on every mount-time invocation and only turns false once `spec`
  // has actually been replaced by a real edit. It has to hold the value the
  // state actually started from, not the `initialSpec` prop, or the two
  // differ by identity after a back navigation and the editor rewrites the
  // address before the first edit.
  const initialSpecRef = useRef(spec);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);

  useEffect(() => {
    if (spec === initialSpecRef.current) return;

    // The address carries the normalized phrase, so a reload or a back
    // navigation rebuilds the state the preview is already showing.
    debounceTimer.current = setTimeout(() => writeUrl(normalizedSpec), DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [spec, normalizedSpec]);

  function updateParams(patch: Partial<PosterParams>) {
    setSaveMessages([]);
    setSpec((s) => ({ ...s, params: { ...s.params, ...patch } }));
  }

  function handlePhraseChange(value: string) {
    setSaveMessages([]);
    setSpec((s) => {
      // Counted on the normalized form, the one the accent index points into.
      const wordCount = splitWords(normalizePhrase(value)).length;
      const accent = s.params.accent !== null && s.params.accent >= wordCount ? null : s.params.accent;
      return { phrase: value, params: { ...s.params, accent } };
    });
  }

  // All three read the normalized phrase: the accent options have to be the
  // words the renderer will actually draw, and validatePhrase normalizes
  // internally anyway, so passing it the raw string would only hide that.
  const words = splitWords(normalizedSpec.phrase);
  const wordCount = words.length;
  const charCount = normalizedSpec.phrase.length;
  const phraseResult = validatePhrase(normalizedSpec.phrase);
  const paramsResult = validateParams(normalizedSpec.params, wordCount);
  const ruleIssues: readonly ValidationIssue[] = [
    ...(phraseResult.ok ? [] : phraseResult.issues),
    ...(paramsResult.ok ? [] : paramsResult.issues),
  ];
  const validSpec = ruleIssues.length === 0 ? normalizedSpec : null;
  // Layout is only known for a spec that passed the rules and went through
  // Preview; for any other spec the rule messages already say what is wrong.
  const liveIssues: readonly ValidationIssue[] =
    validSpec !== null && !layoutFits ? [{ field: 'layout', code: 'does_not_fit' }] : ruleIssues;
  const phraseInvalid = ruleIssues.some((issue) => issue.field === 'phrase');
  // Save stays shut while the input has a problem: the poster on screen is
  // then the last good one, not the one the input describes, and saving must
  // never pair it with the new phrase. The server refuses such a spec too;
  // this keeps the visitor from spending a round trip to learn it.
  const canSave = liveIssues.length === 0;
  const staleNote =
    liveIssues.length === 0
      ? null
      : liveIssues.some((issue) => issue.field === 'layout')
        ? 'No layout for this setting. Showing the last poster that fit.'
        : 'Showing the last valid phrase. Fix the input to update.';

  async function handleSave() {
    // Synchronous guard: setIsSaving below only reaches the DOM on the next
    // render, so a second click arriving before that commit would still see
    // a non-disabled button. savingRef is set before any await, so it blocks
    // the second call in the same tick, ahead of React's state update.
    if (savingRef.current) return;
    if (!canSave) {
      // The button is aria-disabled rather than disabled so it stays
      // focusable and its reason stays readable; a click sends the visitor
      // to the field that explains what to fix.
      phraseRef.current?.focus();
      return;
    }
    savingRef.current = true;

    clearTimeout(debounceTimer.current);
    writeUrl(normalizedSpec);
    setSaveMessages([]);
    setIsSaving(true);

    // The call itself can fail, not just come back refused: a dropped
    // connection or a cold start that times out rejects the promise. Without
    // this the rejection escaped as an unhandled one, isSaving stayed true and
    // savingRef stayed latched - the button went grey and dead for good, with
    // nothing on screen explaining why, and only a reload got out of it.
    let result: SavePosterResult;
    try {
      result = await savePoster(normalizedSpec.phrase, normalizedSpec.params);
    } catch {
      setSaveMessages([SAVE_FAILED_MESSAGE]);
      setIsSaving(false);
      savingRef.current = false;
      return;
    }

    if (!result.ok) {
      setSaveMessages(
        result.reason === 'rate_limited' ? [RATE_LIMIT_MESSAGE] : result.issues.map(describeIssue),
      );
      setIsSaving(false);
      savingRef.current = false;
    }
  }

  const fieldMessages = liveIssues.map(describeIssue);
  const charsOver = charCount > MAX_CHARS;

  return (
    <div className="emq-editor emq-enter">
      <style>{`
        .emq-editor {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas: 'preview' 'controls';
          gap: 20px;
          padding-top: 4px;
          padding-bottom: 8px;
          --emq-preview-h: clamp(180px, 34dvh, 340px);
        }
        .emq-editor-controls { grid-area: controls; display: flex; flex-direction: column; gap: 22px; min-width: 0; }
        .emq-editor-preview { grid-area: preview; min-width: 0; }

        /* Phone: the preview stays pinned under the header while the settings
           scroll beneath it, small enough to leave most of the screen to the
           controls. A solid band behind it keeps scrolled controls from
           showing through around the poster. */
        .emq-editor-preview {
          position: sticky;
          top: var(--emq-header-height);
          z-index: 20;
          margin-inline: calc(var(--emq-gutter) * -1);
          padding: 8px var(--emq-gutter) 12px;
          background: var(--emq-bg);
          border-bottom: 1px solid var(--emq-border);
        }
        .emq-editor-preview-frame {
          position: relative;
          width: min(100%, calc(var(--emq-preview-h) * 0.8));
          margin-inline: auto;
        }
        /* Under the sticky header the editor's header backdrop is solid and
           stops at the header's edge - a fade would dim the top of the
           pinned poster. */
        .emq-page:has(.emq-editor) .emq-site-header--scrolled::before {
          height: calc(100% + 32px);
          background: var(--emq-bg);
        }
        /* Focus moves (Tab into a field) scroll it clear of both pinned bars. */
        html:has(.emq-editor) {
          scroll-padding-top: calc(var(--emq-header-height) + var(--emq-preview-h) + 40px);
        }
        /* A phone on its side has no height to spare for a pinned poster. */
        @media (max-height: 560px) and (max-width: 719px) {
          .emq-editor-preview { position: static; margin-inline: 0; padding: 0; border: 0; background: none; }
          html:has(.emq-editor) { scroll-padding-top: calc(var(--emq-header-height) + 16px); }
        }

        .emq-editor-preview-slot {
          aspect-ratio: 0.8;
          width: 100%;
          border-radius: 3px;
          overflow: hidden;
          outline: 1px solid var(--emq-border);
          transition: opacity var(--emq-base) var(--emq-ease);
        }
        .emq-editor-preview-slot > svg { display: block; width: 100%; height: 100%; }
        .emq-editor-preview-frame[data-stale='true'] .emq-editor-preview-slot { opacity: 0.35; }
        .emq-editor-stale {
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 8px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 6px;
          background: color-mix(in srgb, var(--emq-bg) 92%, transparent);
          border: 1px solid color-mix(in srgb, var(--emq-warning) 55%, var(--emq-border));
          color: var(--emq-warning);
          font-size: 12px;
          line-height: 1.35;
          font-weight: 500;
        }
        .emq-editor-stale svg { flex: none; margin-top: 1px; }

        /* Tablet and up: settings and poster side by side, the poster pinned
           while the settings column scrolls past it. */
        @media (min-width: 720px) {
          .emq-editor {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            grid-template-areas: 'controls preview';
            column-gap: 32px;
            align-items: start;
            padding-top: 16px;
          }
          .emq-editor-preview {
            top: calc(var(--emq-header-height) + 16px);
            margin: 0;
            padding: 0;
            background: none;
            border: 0;
          }
          .emq-editor-preview-frame {
            width: min(100%, calc((100dvh - var(--emq-header-height) - 72px) * 0.8));
          }
          html:has(.emq-editor) { scroll-padding-top: calc(var(--emq-header-height) + 24px); }
        }
        @media (min-width: 1024px) {
          .emq-editor {
            grid-template-columns: 380px minmax(0, 1fr);
            column-gap: clamp(40px, 5vw, 72px);
          }
        }

        /* Form parts. */
        .emq-field { display: flex; flex-direction: column; gap: 8px; }
        .emq-field-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .emq-label {
          color: var(--emq-text);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .emq-hint { color: var(--emq-text-muted); font-size: 13px; line-height: 1.45; }
        .emq-count { color: var(--emq-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .emq-count[data-over='true'] { color: var(--emq-danger); }

        .emq-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--emq-border);
          background: var(--emq-surface);
          color: var(--emq-text);
          /* 16px keeps iOS Safari from zooming the page when the field takes focus. */
          font-size: 16px;
          font-weight: 500;
          line-height: 1.4;
          padding: 10px 12px;
          transition: border-color var(--emq-fast) var(--emq-ease);
        }
        .emq-input:hover { border-color: var(--emq-border-strong); }
        .emq-input:focus-visible { outline-offset: 0; border-color: var(--emq-accent); }
        .emq-input[aria-invalid='true'] { border-color: var(--emq-danger); }
        .emq-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23A3AAA6' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 36px;
          min-height: 44px;
        }
        /* The native option popup draws on a white system background on
           Windows; without an explicit color the light text vanished there. */
        .emq-select option { background: var(--emq-surface); color: var(--emq-text); }

        .emq-errors { display: flex; flex-direction: column; gap: 4px; }
        .emq-errors:empty { display: none; }
        .emq-error {
          display: flex;
          gap: 8px;
          color: var(--emq-danger);
          font-size: 13px;
          line-height: 1.4;
          font-weight: 500;
        }
        .emq-error svg { flex: none; margin-top: 2px; }

        .emq-field { container-type: inline-size; }
        .emq-segmented {
          display: grid;
          grid-template-columns: repeat(var(--emq-seg-cols), minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          border-radius: 10px;
          background: var(--emq-surface);
          border: 1px solid var(--emq-border);
        }
        .emq-segment {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 44px;
          padding: 8px 6px;
          border-radius: 7px;
          border: 1px solid transparent;
          color: var(--emq-text-muted);
          font-size: 13px;
          font-weight: 500;
          line-height: 1.1;
          cursor: pointer;
          transition: color var(--emq-fast) var(--emq-ease), background-color var(--emq-fast) var(--emq-ease),
            border-color var(--emq-fast) var(--emq-ease);
        }
        .emq-segment:hover:not(:disabled) { color: var(--emq-text); background: var(--emq-surface-raised); }
        .emq-segment:focus-visible { outline-offset: -1px; }
        /* Selected reads by fill, border and a corner mark - not by hue alone. */
        .emq-segment[aria-checked='true'] {
          color: var(--emq-text);
          background: color-mix(in srgb, var(--emq-accent) 12%, var(--emq-surface-raised));
          border-color: var(--emq-accent);
        }
        .emq-segment[aria-checked='true']::after {
          content: '';
          position: absolute;
          top: 5px;
          right: 5px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--emq-accent);
        }
        .emq-segment[aria-checked='true'] svg { color: var(--emq-accent); }
        .emq-segment:disabled { cursor: not-allowed; opacity: 0.35; }
        /* Five icon-and-label segments need about 56px each ("Column" is the
           widest label); below that the row folds 3 + 2 rather than
           squeezing them. */
        @container (max-width: 300px) {
          .emq-segmented[data-fold='true'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }

        .emq-switch {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          padding-inline: 4px;
          color: var(--emq-text-muted);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
        }
        .emq-switch[aria-checked='true'] { color: var(--emq-text); }
        .emq-switch-track {
          position: relative;
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: var(--emq-surface);
          border: 1px solid var(--emq-border-strong);
          transition: background-color var(--emq-fast) var(--emq-ease), border-color var(--emq-fast) var(--emq-ease);
        }
        .emq-switch-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--emq-text-muted);
          transition: transform var(--emq-base) var(--emq-ease), background-color var(--emq-fast) var(--emq-ease);
        }
        .emq-switch[aria-checked='true'] .emq-switch-track {
          background: color-mix(in srgb, var(--emq-accent) 22%, var(--emq-surface));
          border-color: var(--emq-accent);
        }
        .emq-switch[aria-checked='true'] .emq-switch-thumb {
          transform: translateX(20px);
          background: var(--emq-accent);
        }

        .emq-editor-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      `}</style>

      <h1 className="emq-sr-only">Poster editor</h1>

      <section className="emq-editor-controls" aria-label="Poster settings">
        <div className="emq-field">
          <div className="emq-field-head">
            <label htmlFor={ids.phrase} className="emq-label">
              Phrase
            </label>
            <span id={ids.phraseCount} className="emq-count" data-over={charsOver}>
              <span className="emq-sr-only">Length: </span>
              {wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount}/{MAX_CHARS}
              <span className="emq-sr-only"> characters</span>
            </span>
          </div>
          <textarea
            ref={phraseRef}
            id={ids.phrase}
            className="emq-input"
            style={{ resize: 'none' }}
            rows={2}
            spellCheck={false}
            value={spec.phrase}
            aria-invalid={phraseInvalid}
            aria-describedby={`${ids.phraseHint} ${ids.phraseCount} ${ids.phraseError}`}
            onChange={(e) => handlePhraseChange(e.target.value)}
          />
          <p id={ids.phraseHint} className="emq-hint">
            {MIN_WORDS}–{MAX_WORDS} words, up to {MAX_CHARS} characters. Latin or Cyrillic letters, digits and basic
            punctuation.
          </p>
          {/* Always in the DOM, so screen readers pick up each new message
              as it appears instead of missing the first one. */}
          <div id={ids.phraseError} className="emq-errors" aria-live="polite" aria-atomic="true">
            {fieldMessages.map((message) => (
              <p key={message} className="emq-error">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                  <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 4.6v4M8 10.9v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {message}
              </p>
            ))}
          </div>
        </div>

        <div className="emq-field">
          <span id={ids.modeLabel} className="emq-label">
            Mode
          </span>
          <SegmentedControl
            labelledBy={ids.modeLabel}
            describedBy={ids.modeHint}
            fold
            options={MODES.map((mode) => ({
              value: mode,
              label: MODE_LABELS[mode],
              icon: <ModeIcon mode={mode} />,
              disabled: !(AVAILABLE_MODES as readonly string[]).includes(mode),
            }))}
            value={spec.params.mode}
            onChange={(mode) => updateParams({ mode })}
          />
          <p id={ids.modeHint} className="emq-hint">
            How the words are laid out. Some modes crop big letters at the edge on purpose.
          </p>
        </div>

        <div className="emq-field">
          <span id={ids.densityLabel} className="emq-label">
            Density
          </span>
          <SegmentedControl
            labelledBy={ids.densityLabel}
            describedBy={ids.densityHint}
            options={DENSITIES.map((density) => ({ value: density, label: DENSITY_LABELS[density] }))}
            value={spec.params.density}
            onChange={(density) => updateParams({ density })}
          />
          <p id={ids.densityHint} className="emq-hint">
            How much empty space surrounds the letters.
          </p>
        </div>

        <div className="emq-field">
          <span id={ids.grainLabel} className="emq-label">
            Grain
          </span>
          <SegmentedControl
            labelledBy={ids.grainLabel}
            describedBy={ids.grainHint}
            options={GRAIN_LEVELS.map((grain) => ({ value: String(grain), label: GRAIN_LABELS[grain] }))}
            value={String(spec.params.grain)}
            onChange={(v) =>
              // SegmentedControl only ever offers GRAIN_LEVELS-derived values, so
              // this string always round-trips to a valid GrainLevel.
              updateParams({ grain: Number(v) as GrainLevel })
            }
          />
          <p id={ids.grainHint} className="emq-hint">
            Specks of dust drawn into the poster, for a printed feel.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span id={ids.invertLabel} className="emq-label">
              Invert colors
            </span>
            <span id={ids.invertHint} className="emq-hint">
              Black letters on white paper.
            </span>
          </div>
          <Toggle
            checked={spec.params.invert}
            onChange={(invert) => updateParams({ invert })}
            labelledBy={ids.invertLabel}
            describedBy={ids.invertHint}
          />
        </div>

        <div className="emq-field">
          <label htmlFor={ids.accent} className="emq-label">
            Accent word
          </label>
          <select
            id={ids.accent}
            className="emq-input emq-select"
            aria-describedby={ids.accentHint}
            value={spec.params.accent ?? ''}
            onChange={(e) => updateParams({ accent: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">None</option>
            {words.map((word, i) => (
              <option key={i} value={i}>
                {word}
              </option>
            ))}
          </select>
          <p id={ids.accentHint} className="emq-hint">
            Paints one word in the signal green.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-1">
          <div className="emq-editor-actions">
            <button type="button" className="emq-btn emq-btn--secondary" onClick={() => setSpec(randomSpec())}>
              Randomize
            </button>
            <button
              type="button"
              className="emq-btn emq-btn--primary"
              aria-disabled={!canSave || isSaving}
              aria-describedby={canSave ? ids.saveNote : `${ids.saveNote} ${ids.phraseError}`}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save poster'}
            </button>
          </div>
          <p id={ids.saveNote} className="emq-hint">
            {canSave
              ? 'Saving creates a new poster with its own permanent link. Randomize replaces the phrase and every setting.'
              : liveIssues.some((issue) => issue.field === 'layout')
                ? 'Pick another mode or density to save.'
                : 'Fix the phrase above to save.'}
          </p>
          <div className="emq-errors" aria-live="polite" aria-atomic="true">
            {saveMessages.map((message) => (
              <p key={message} className="emq-error">
                {message}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="emq-editor-preview" aria-label="Preview">
        <Preview
          spec={validSpec}
          initialSvg={initialSvg}
          onFitChange={setLayoutFits}
          staleNote={staleNote}
          staleNoteId={ids.stale}
        />
      </section>
    </div>
  );
}
