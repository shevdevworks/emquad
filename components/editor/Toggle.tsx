'use client';

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Id of the visible label - the switch's accessible name. */
  readonly labelledBy: string;
  readonly describedBy?: string;
}

export function Toggle({ checked, onChange, labelledBy, describedBy }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="emq-switch"
    >
      {/* The state in words as well as position and color. */}
      <span className="emq-switch-state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <span className="emq-switch-track" aria-hidden="true">
        <span className="emq-switch-thumb" />
      </span>
    </button>
  );
}
