'use client';

import { useShowcase } from '@/components/global/GlobalChrome';

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  const { accentColor } = useShowcase();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="emq-editor-glass relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ borderColor: checked ? accentColor : undefined }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full transition-transform"
        style={{
          left: '2px',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          background: checked ? accentColor : '#8A9299',
        }}
      />
    </button>
  );
}
