'use client';

/**
 * TEMPORARY — stage 6 acceptance/review control panel.
 * Exists only so an operator can eyeball background/transition combinations
 * across the home page, poster page, and editor before the final design is
 * locked. Delete this file and its usage at the end of stage 6.
 * Must never ship to production.
 */

export const ACCENT_CANDIDATES = ['#E8E4D9', '#00E5A0', '#FFD400', '#C4462F', '#7B61FF', '#B8FF3C'] as const;

type LayerKey = 'photo' | 'vignette' | 'light' | 'grain';
type ThreeStep = 0 | 1 | 2;

export interface ShowcasePanelProps {
  readonly layers: Record<LayerKey, boolean>;
  readonly onToggleLayer: (key: LayerKey) => void;
  readonly grainStep: ThreeStep;
  readonly onGrainStepChange: (step: ThreeStep) => void;
  readonly photoOpacity: number;
  readonly onPhotoOpacityChange: (opacity: number) => void;
  readonly accentColor: string;
  readonly onAccentColorChange: (color: string) => void;
  readonly phraseAccentOn: boolean;
  readonly onPhraseAccentChange: (on: boolean) => void;
}

const LAYER_LABELS: Record<LayerKey, string> = {
  photo: 'VIDEO',
  vignette: 'VIGNETTE',
  light: 'LIGHT',
  grain: 'GRAIN',
};

export function ShowcasePanel({
  layers,
  onToggleLayer,
  grainStep,
  onGrainStepChange,
  photoOpacity,
  onPhotoOpacityChange,
  accentColor,
  onAccentColorChange,
  phraseAccentOn,
  onPhraseAccentChange,
}: ShowcasePanelProps) {
  return (
    <div className="fixed bottom-8 left-8 z-50 w-64 rounded border border-white/15 bg-black/70 p-3 font-mono text-[11px] text-white/80 backdrop-blur-sm">
      <div className="mb-2 flex flex-col gap-1">
        {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={layers[key]} onChange={() => onToggleLayer(key)} />
            {LAYER_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="mb-2">
        <div className="text-white/50">video visibility</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={photoOpacity}
            onChange={(e) => onPhotoOpacityChange(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-9 text-right">{photoOpacity}%</span>
        </div>
      </div>

      <div className="mb-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={phraseAccentOn} onChange={(e) => onPhraseAccentChange(e.target.checked)} />
          PHRASE ACCENT
        </label>
      </div>

      <div className="mb-2">
        <div className="text-white/50">grain intensity</div>
        <div className="flex gap-2">
          {([0, 1, 2] as const).map((step) => (
            <label key={step} className="flex items-center gap-1">
              <input
                type="radio"
                name="grain-step"
                checked={grainStep === step}
                onChange={() => onGrainStepChange(step)}
              />
              {step}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-2">
        <div className="text-white/50">accent</div>
        <div className="flex flex-col gap-1">
          {ACCENT_CANDIDATES.map((hex) => (
            <label key={hex} className="flex items-center gap-2">
              <input
                type="radio"
                name="accent-color"
                checked={accentColor === hex}
                onChange={() => onAccentColorChange(hex)}
              />
              <span className="inline-block h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: hex }} />
              {hex}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
