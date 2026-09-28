import { JSX } from 'preact';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange }: Props): JSX.Element {
  return (
    <div class="slider">
      <label>
        <span>{label}</span>
        <span>{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </label>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        aria-label={`${label}, ${value}${unit}`}
        onInput={(e) => onChange(parseFloat((e.currentTarget as HTMLInputElement).value))}
      />
    </div>
  );
}
