'use client';

import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
  /** Drawn above the label, e.g. a mode diagram. */
  readonly icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Id of the visible group label. */
  readonly labelledBy: string;
  /** Id of the hint explaining the setting, if there is one. */
  readonly describedBy?: string;
  /**
   * Lets a long row (the five modes) fold into two rows of three and two when
   * its container is narrow, instead of running off a phone screen. The fold
   * itself is a container query on .emq-segmented[data-fold] in Editor.tsx.
   */
  readonly fold?: boolean;
}

/**
 * Index arrow-key navigation moves to inside a one-dimensional group, as the
 * WAI-ARIA radio group and tabs patterns define it: arrows step and wrap,
 * Home and End jump to the ends, disabled items are skipped. null when the key
 * is not a navigation key, so the caller can leave the event alone.
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  isDisabled: (index: number) => boolean,
): number | null {
  let step: number;
  let start: number;
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    step = 1;
    start = current;
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    step = -1;
    start = current;
  } else if (key === 'Home') {
    step = 1;
    start = -1;
  } else if (key === 'End') {
    step = -1;
    start = count;
  } else {
    return null;
  }

  for (let i = 1; i <= count; i++) {
    const candidate = (((start + step * i) % count) + count) % count;
    if (!isDisabled(candidate)) return candidate;
  }
  return null;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
  fold = false,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(event.key, index, options.length, (i) => options[i].disabled === true);
    if (next === null) return;
    event.preventDefault();
    // Radio semantics: moving the focus is choosing.
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="emq-segmented"
      data-fold={fold}
      // A custom property rather than grid-template-columns itself, so the
      // fold rule in the stylesheet can still override the column count. The
      // cast is needed because custom properties are not CSSProperties keys.
      style={{ ['--emq-seg-cols' as string]: options.length }}
    >
      {options.map((option, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            // One tab stop per group: Tab moves between groups, the arrows
            // move inside one.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className="emq-segment"
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
