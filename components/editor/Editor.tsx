'use client';

import { useEffect, useRef, useState } from 'react';
import { savePoster } from '@/actions/save-poster';
import { SITE_ACCENT, TEXT_MUTED, TEXT_PRIMARY } from '@/lib/theme';
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
  type GrainLevel,
  type PosterParams,
  type PosterSpec,
} from '@/lib/poster/types';
import { searchParamsToSpec, specToSearchParams } from '@/lib/poster/url';
import {
  splitWords,
  validateParams,
  validatePhrase,
  type ValidationIssue,
} from '@/lib/poster/validate';
import { RANDOM_PHRASES } from './random-phrases';
import { SegmentedControl } from './SegmentedControl';
import { Toggle } from './Toggle';
import { Preview } from './Preview';

export interface EditorProps {
  readonly initialSpec: PosterSpec;
  readonly initialSvg: string;
}

const DEBOUNCE_MS = 300;

// Measured against the real editor background (Step 0.2 of stage 6.4's
// plan): sampling the composited video+light+grain layer at the error
// block's actual position (bottom of the controls column, far from the
// LIGHT layer's hotspot at 79% viewport width) gave a worst-case pixel of
// rgb(46,51,53) - contrast of #FF6B5B against it is only ~4.57:1, too
// close to the 4.5:1 floor given the background is an animated video
// frame, not a fixed color. The dark backing below (not a color change)
// pulls the effective background near-black, raising contrast to ~6.9:1.
const ERROR_COLOR = '#FF6B5B';

const RATE_LIMIT_MESSAGE = 'Too many saves in a row. Wait a minute and try again.';

const GROUP_LABEL_STYLE = {
  fontFamily: 'Onest',
  fontWeight: 500,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: TEXT_MUTED,
};

const FIELD_TEXT_STYLE = {
  fontFamily: 'Onest',
  fontWeight: 500,
  fontSize: '13px',
  color: TEXT_PRIMARY,
};

const BUTTON_TEXT_STYLE = {
  fontFamily: 'Onest',
  fontWeight: 500,
  fontSize: '13px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

function writeUrl(spec: PosterSpec) {
  const qs = specToSearchParams(spec).toString();
  window.history.replaceState(null, '', qs ? `/create?${qs}` : '/create');
}

// Returning from a saved poster with the back button restores the address
// writeUrl left behind, but remounts the editor with whichever server payload
// the Router Cache holds for /create - usually the one rendered for the bare
// entry, whose spec is the default. Measured: address
// /create?phrase=BACK+BUTTON+TEST+PHRASE, textarea "the poster starts here".
// The address is the reliable half, so it wins on mount. Reading it costs no
// network request, unlike the router.replace this project rejected in 6.4.
function specFromAddress(serverSpec: PosterSpec): PosterSpec {
  if (typeof window === 'undefined') return serverSpec;
  return searchParamsToSpec(new URLSearchParams(window.location.search));
}

// Plain-English copy for every ValidationIssue lib/poster/validate.ts can
// produce. validate.ts itself only returns {field, code} pairs - this is
// the sole place that turns them into text, so lib/poster stays free of UI copy.
function describeIssue(issue: ValidationIssue): string {
  if (issue.field === 'phrase') {
    if (issue.code === 'too_few_words') return `Phrase must be at least ${MIN_WORDS} words.`;
    if (issue.code === 'too_many_words') return `Phrase must be ${MAX_WORDS} words or fewer.`;
    if (issue.code === 'unsupported_chars') return `The typeface has no glyph for: ${issue.chars.join(' ')}`;
    return `Phrase must be under ${MAX_CHARS} characters.`; // remaining case: too_long
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
    // Already on screen and the server would refuse it too; not worth a
    // round trip that also spends the visitor's save budget.
    if (liveIssues.some((issue) => issue.field === 'layout')) return;
    savingRef.current = true;

    clearTimeout(debounceTimer.current);
    writeUrl(spec);
    setSaveMessages([]);
    setIsSaving(true);
    const result = await savePoster(spec.phrase, spec.params);
    if (!result.ok) {
      setSaveMessages(
        result.reason === 'rate_limited' ? [RATE_LIMIT_MESSAGE] : result.issues.map(describeIssue),
      );
      setIsSaving(false);
      savingRef.current = false;
    }
  }

  const words = splitWords(spec.phrase);
  const wordCount = words.length;
  const phraseResult = validatePhrase(spec.phrase);
  const paramsResult = validateParams(spec.params, wordCount);
  const ruleIssues: readonly ValidationIssue[] = [
    ...(phraseResult.ok ? [] : phraseResult.issues),
    ...(paramsResult.ok ? [] : paramsResult.issues),
  ];
  const validSpec = ruleIssues.length === 0 ? spec : null;
  // Layout is only known for a spec that passed the rules and went through
  // Preview; for any other spec the rule messages already say what is wrong.
  const liveIssues: readonly ValidationIssue[] =
    validSpec !== null && !layoutFits ? [{ field: 'layout', code: 'does_not_fit' }] : ruleIssues;
  const displayedMessages =
    liveIssues.length > 0 ? liveIssues.map(describeIssue) : saveMessages;

  return (
    <div className="emq-editor-row flex w-full flex-1" style={{ gap: '72px' }}>
      <style>{`
        .emq-editor-glass {
          background: rgba(255, 255, 255, var(--glass-fill));
          border: 1px solid rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .emq-editor-controls {
          width: 380px;
          flex: 0 0 380px;
          align-self: flex-start;
        }
        .emq-editor-preview {
          flex: 1 1 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .emq-editor-preview-slot {
          flex: 1 1 0;
          min-height: 0;
          max-width: 100%;
          aspect-ratio: 0.8;
        }
        .emq-editor-preview-slot > svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .emq-editor-error-backing {
          background: rgba(0, 0, 0, 0.72);
          border-radius: 8px;
          align-self: flex-start;
          max-width: 100%;
        }

        @media (max-width: 1023px) {
          .emq-editor-row {
            flex-direction: column;
            gap: 32px;
          }
          .emq-editor-controls {
            width: 100%;
            flex: 0 0 auto;
          }
          .emq-editor-preview {
            order: -1;
            width: 100%;
            flex: 0 0 auto;
          }
          .emq-editor-preview-slot {
            width: 100%;
            height: auto;
            flex: 0 0 auto;
          }
        }
      `}</style>

      <div className="emq-editor-controls flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span style={GROUP_LABEL_STYLE}>Phrase</span>
          <textarea
            className="emq-editor-glass rounded-lg px-3 py-2"
            style={{ ...FIELD_TEXT_STYLE, resize: 'none' }}
            rows={3}
            value={spec.phrase}
            onChange={(e) => handlePhraseChange(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span style={GROUP_LABEL_STYLE}>Mode</span>
          <SegmentedControl
            letterSpacing="0.08em"
            options={MODES.map((mode) => ({
              value: mode,
              label: mode,
              disabled: !(AVAILABLE_MODES as readonly string[]).includes(mode),
            }))}
            value={spec.params.mode}
            onChange={(mode) => updateParams({ mode })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span style={GROUP_LABEL_STYLE}>Density</span>
          <SegmentedControl
            options={DENSITIES.map((density) => ({ value: density, label: density }))}
            value={spec.params.density}
            onChange={(density) => updateParams({ density })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span style={GROUP_LABEL_STYLE}>Grain</span>
          <SegmentedControl
            options={GRAIN_LEVELS.map((grain) => ({ value: String(grain), label: String(grain) }))}
            value={String(spec.params.grain)}
            onChange={(v) =>
              // SegmentedControl only ever offers GRAIN_LEVELS-derived values, so
              // this string always round-trips to a valid GrainLevel.
              updateParams({ grain: Number(v) as GrainLevel })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span style={GROUP_LABEL_STYLE}>Invert</span>
          <Toggle checked={spec.params.invert} onChange={(invert) => updateParams({ invert })} />
        </div>

        <label className="flex flex-col gap-1">
          <span style={GROUP_LABEL_STYLE}>Accent word</span>
          <select
            className="emq-editor-glass rounded-lg px-3 py-2"
            style={{
              ...FIELD_TEXT_STYLE,
              appearance: 'none',
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238A9299' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '32px',
            }}
            value={spec.params.accent ?? ''}
            onChange={(e) =>
              updateParams({ accent: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="" style={{ backgroundColor: '#101214', color: TEXT_PRIMARY }}>
              None
            </option>
            {words.map((word, i) => (
              <option key={i} value={i} style={{ backgroundColor: '#101214', color: TEXT_PRIMARY }}>
                {word}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            className="emq-editor-glass flex-1 rounded-lg px-4 py-2.5 transition-opacity hover:opacity-90"
            style={{ ...BUTTON_TEXT_STYLE, color: TEXT_PRIMARY }}
            onClick={() => setSpec(randomSpec())}
          >
            Randomize
          </button>

          <button
            type="button"
            disabled={isSaving}
            className="flex-1 rounded-lg px-4 py-2.5 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ ...BUTTON_TEXT_STYLE, backgroundColor: SITE_ACCENT, color: '#101214' }}
            onClick={() => void handleSave()}
          >
            Save
          </button>
        </div>

        {displayedMessages.length > 0 && (
          <ul
            className="emq-editor-error-backing flex flex-col gap-1 px-3 py-2"
            style={{ fontFamily: 'Onest', fontWeight: 500, fontSize: '12px', color: ERROR_COLOR }}
          >
            {displayedMessages.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="emq-editor-preview">
        <Preview spec={validSpec} initialSvg={initialSvg} onFitChange={setLayoutFits} />
      </div>
    </div>
  );
}
