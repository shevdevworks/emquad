'use client';

import { SITE_ACCENT } from '@/lib/theme';

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="emq-editor-glass relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ borderColor: checked ? SITE_ACCENT : undefined }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full transition-transform"
        style={{
          left: '2px',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          background: checked ? SITE_ACCENT : '#8A9299',
        }}
      />
    </button>
  );
}
