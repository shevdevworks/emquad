'use client';

/**
 * TEMPORARY — stage 6 acceptance/review control panel.
 * Exists only so an operator can eyeball background/transition combinations
 * across the home page, poster page, and editor before the final design is
 * locked. Delete this file and its usage at the end of stage 6.
 * Must never ship to production.
 */

import type { Mode } from '@/lib/poster/types';

export const ACCENT_CANDIDATES = ['#FF3B2F', '#FF5B34', '#E8402F', '#FF7A45'] as const;

type LayerKey = 'photo' | 'vignette' | 'light' | 'motion' | 'grain';
type MotionSpeed = 'slow' | 'medium' | 'off';
type TransitionStyle = 'hard' | 'soft';
type ThreeStep = 0 | 1 | 2;

export interface ShowcasePanelProps {
  readonly layers: Record<LayerKey, boolean>;
  readonly onToggleLayer: (key: LayerKey) => void;
  readonly motionSpeed: MotionSpeed;
  readonly onMotionSpeedChange: (speed: MotionSpeed) => void;
  readonly grainStep: ThreeStep;
  readonly onGrainStepChange: (step: ThreeStep) => void;
  readonly photoOpacity: number;
  readonly onPhotoOpacityChange: (opacity: number) => void;
  readonly transitionStyle: TransitionStyle;
  readonly onTransitionStyleChange: (style: TransitionStyle) => void;
  readonly accentColor: string;
  readonly onAccentColorChange: (color: string) => void;
  readonly onAdvance: () => void;
  readonly currentMode: Mode;
  readonly currentSeed: number;
}

const LAYER_LABELS: Record<LayerKey, string> = {
  photo: 'PHOTO',
  vignette: 'VIGNETTE',
  light: 'LIGHT',
  motion: 'MOTION',
  grain: 'GRAIN',
};

export function ShowcasePanel({
  layers,
  onToggleLayer,
  motionSpeed,
  onMotionSpeedChange,
  grainStep,
  onGrainStepChange,
  photoOpacity,
  onPhotoOpacityChange,
  transitionStyle,
  onTransitionStyleChange,
  accentColor,
  onAccentColorChange,
  onAdvance,
  currentMode,
  currentSeed,
}: ShowcasePanelProps) {
  return (
    <div className="fixed bottom-8 left-8 z-50 w-64 rounded border border-white/15 bg-black/70 p-3 font-mono text-[11px] text-white/80 backdrop-blur-sm">
      <div className="mb-2 text-white/50">{currentMode} · seed {currentSeed}</div>

      <div className="mb-2 flex flex-col gap-1">
        {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={layers[key]} onChange={() => onToggleLayer(key)} />
            {LAYER_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="mb-2">
        <div className="text-white/50">photo visibility</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={photoOpacity}
            onChange={(e) => onPhotoOpacityChange(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-9 text-right">{photoOpacity}%</span>
        </div>
      </div>

      <div className="mb-2">
        <div className="text-white/50">motion speed</div>
        <div className="flex gap-2">
          {(['slow', 'medium', 'off'] as MotionSpeed[]).map((speed) => (
            <label key={speed} className="flex items-center gap-1">
              <input
                type="radio"
                name="motion-speed"
                checked={motionSpeed === speed}
                onChange={() => onMotionSpeedChange(speed)}
              />
              {speed}
            </label>
          ))}
        </div>
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
        <div className="text-white/50">transition</div>
        <div className="flex gap-2">
          {(['hard', 'soft'] as TransitionStyle[]).map((style) => (
            <label key={style} className="flex items-center gap-1">
              <input
                type="radio"
                name="transition-style"
                checked={transitionStyle === style}
                onChange={() => onTransitionStyleChange(style)}
              />
              {style}
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

      <button
        type="button"
        onClick={onAdvance}
        className="w-full rounded border border-white/20 py-1 text-white/80 hover:bg-white/10"
      >
        next
      </button>
    </div>
  );
}
