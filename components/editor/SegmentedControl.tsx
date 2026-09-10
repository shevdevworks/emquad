'use client';

import { SITE_ACCENT, TEXT_MUTED, TEXT_PRIMARY } from '@/lib/theme';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Lower tracking for labels that don't fit at the site-wide 0.18em (measured, see plan Step 0.1). */
  readonly letterSpacing?: string;
  readonly wrap?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  letterSpacing = '0.18em',
  wrap = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className="emq-editor-glass flex gap-1 rounded-lg p-1"
      style={{ flexWrap: wrap ? 'wrap' : 'nowrap' }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className="flex-1 rounded-md px-2 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            style={{
              fontFamily: 'Onest',
              fontWeight: 500,
              fontSize: '11px',
              letterSpacing,
              textTransform: 'uppercase',
              color: active ? TEXT_PRIMARY : TEXT_MUTED,
              background: active ? `color-mix(in srgb, ${SITE_ACCENT} 18%, transparent)` : 'transparent',
              border: `1px solid ${active ? SITE_ACCENT : 'transparent'}`,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
