export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div>
      <div class="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span>{(20 * Math.log10(Math.max(value, 1e-4))).toFixed(0)} dB</span>
      </div>
      <div class="meter"><div style={{ width: pct + '%' }} /></div>
    </div>
  );
}
