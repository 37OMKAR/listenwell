import { useEffect, useRef, useState } from 'preact/hooks';
import { Engine, Meters } from '../audio/engine';
import { defaultParams, EngineParams, ModelId, presets } from '../audio/params';
import { ensureMicPermission, listDevices, looksLikeBluetooth, pickPhoneMic } from '../audio/devices';
import { modelLabel } from '../models/loaders';
import { Slider } from './components/Slider';
import { Meter } from './components/Meter';
import { Spectrum } from './components/Spectrum';
import { getActiveProfile, loadSetting, saveSetting } from '../storage/profiles';
import type { HearingProfile } from '../storage/profiles';

const MODEL_ORDER: ModelId[] = ['off', 'gate', 'speex', 'rnnoise'];

export function ListenScreen() {
  const engineRef = useRef<Engine>(new Engine());
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState<EngineParams>(defaultParams);
  const [meters, setMeters] = useState<Meters>({ inPeak: 0, outPeak: 0, clipMs: 0 });
  const [delayMs, setDelayMs] = useState(0);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string | undefined>();
  const [outId, setOutId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeProfile, setActiveProfile] = useState<HearingProfile | null>(null);

  useEffect(() => {
    engineRef.current.onMeters = setMeters;
    engineRef.current.onDelayMs = setDelayMs;
    (async () => {
      const saved = await loadSetting<EngineParams>('params');
      if (saved) setParams({ ...defaultParams, ...saved });
      setActiveProfile(await getActiveProfile());
    })();
    const onChange = async () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, []);

  async function refreshDevices() {
    try {
      const d = await listDevices();
      setInputs(d.inputs); setOutputs(d.outputs);
    } catch {}
  }

  async function handleStart() {
    setError(null);
    try {
      await ensureMicPermission();
      await refreshDevices();
      const chosenMic = micId ?? (await pickPhoneMic());
      setMicId(chosenMic);
      await engineRef.current.start({ micId: chosenMic, outId, params });
      setRunning(true);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function handleStop() {
    await engineRef.current.stop();
    setRunning(false);
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  }

  function update(p: Partial<EngineParams>) {
    const next = { ...params, ...p };
    setParams(next);
    engineRef.current.update(p);
    void saveSetting('params', next);
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    update(preset.params);
  }

  const activeMicLabel = inputs.find((d) => d.deviceId === micId)?.label ?? '';
  const btWarn = activeMicLabel && looksLikeBluetooth(activeMicLabel);
  const clipping = meters.clipMs > 2000;

  return (
    <div>
      <div class="hero">
        <div class="brand">
          <div class="logo">🎧</div>
          <div>
            <h1>ClearHear</h1>
            <div class="sub">On-device speech clarity</div>
          </div>
        </div>
        <div class="row" style={{ gap: 8, flex: '0 0 auto' }}>
          <span class={'status-dot' + (running ? ' on' : '')} />
          <span class="pill">{running ? `${delayMs.toFixed(0)} ms` : 'idle'}</span>
        </div>
      </div>

      {activeProfile && (
        <div class="info-box" style={{ marginBottom: 12 }}>
          👤 Active profile: <b>{activeProfile.name}</b> — personal EQ applied.
        </div>
      )}

      <div class="card">
        {!running ? (
          <button class="btn big" onClick={handleStart} aria-label="Start listening">
            ▶ Start listening
          </button>
        ) : (
          <button class="btn big stop" onClick={handleStop} aria-label="Stop listening">
            ■ Stop
          </button>
        )}
        <Spectrum engine={engineRef.current} active={running} />
        <div class="meter-row">
          <span class="lab">Mic in</span>
          <div class="meter" style={{ flex: 1 }}><div style={{ width: (Math.min(1, meters.inPeak) * 100) + '%' }} /></div>
          <span class="val">{(20 * Math.log10(Math.max(meters.inPeak, 1e-4))).toFixed(0)} dB</span>
        </div>
        <div class="meter-row">
          <span class="lab">Headphones</span>
          <div class="meter" style={{ flex: 1 }}><div style={{ width: (Math.min(1, meters.outPeak) * 100) + '%' }} /></div>
          <span class="val">{(20 * Math.log10(Math.max(meters.outPeak, 1e-4))).toFixed(0)} dB</span>
        </div>
        {error && <div class="warn-box" role="alert">Error: {error}</div>}
        {btWarn && <div class="warn-box">Selected mic looks like Bluetooth. Use the phone's built-in mic for best quality.</div>}
        {clipping && <div class="warn-box">⚠ Clipping — lower the volume boost.</div>}
      </div>

      <div class="card">
        <h3>Preset</h3>
        <div class="chips">
          {presets.map((p) => (
            <button key={p.id} class="chip" onClick={() => applyPreset(p.id)}>{p.label}</button>
          ))}
        </div>
      </div>

      <div class="card">
        <h3>AI noise model</h3>
        <div class="chips">
          {MODEL_ORDER.map((m) => (
            <button
              key={m}
              class={'chip' + (params.model === m ? ' active' : '')}
              onClick={() => update({ model: m })}
            >{modelLabel[m]}</button>
          ))}
        </div>
        <div class="help">Off = passthrough · Gate = simple noise gate · Speex = classic DSP · RNNoise = neural network</div>
      </div>

      <div class="card">
        <h3>Main controls</h3>
        <Slider label="🔊 Volume boost" unit=" dB" min={0} max={18} value={params.volume} onChange={(v) => update({ volume: v })} />
        <Slider label="🎙 Mic sensitivity" unit=" dB" min={0} max={12} value={params.micGain} onChange={(v) => update({ micGain: v })} />
        <Slider label="🤖 AI mix (wet)" unit="" min={0} max={1} step={0.01} value={params.wetDry} onChange={(v) => update({ wetDry: v })} />
      </div>

      <div class="card">
        <h3>Speech clarity</h3>
        <Slider label="Speech clarity (2.5 kHz)" unit=" dB" min={0} max={15} value={params.clarity} onChange={(v) => update({ clarity: v })} />
        <Slider label="Highs (3.5 kHz)" unit=" dB" min={0} max={15} value={params.highs} onChange={(v) => update({ highs: v })} />
        <Slider label="Warmth (800 Hz)" unit=" dB" min={-6} max={10} value={params.warmth} onChange={(v) => update({ warmth: v })} />
        <Slider label="Presence" unit=" dB" min={0} max={10} value={params.presence} onChange={(v) => update({ presence: v })} />
        <Slider label="Air (10 kHz)" unit=" dB" min={0} max={10} value={params.air} onChange={(v) => update({ air: v })} />
        <Slider label="De-ess (tame sibilance)" unit="" min={0} max={1} step={0.01} value={params.deess} onChange={(v) => update({ deess: v })} />
      </div>

      <button class="btn ghost" style={{ width: '100%' }} onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? '▲ Hide advanced' : '▼ Advanced'}
      </button>

      {showAdvanced && (
        <>
          <div class="card">
            <h3>Advanced</h3>
            <Slider label="Noise gate" unit="" min={0} max={1} step={0.01} value={params.gate} onChange={(v) => update({ gate: v })} />
            <Slider label="Balance L / R" unit="" min={-1} max={1} step={0.01} value={params.balance} onChange={(v) => update({ balance: v })} />
          </div>

          <div class="card">
            <h3>Devices</h3>
            <div class="help" style={{ marginBottom: 6 }}>Microphone</div>
            <select class="select" value={micId} onChange={(e) => setMicId((e.currentTarget as HTMLSelectElement).value)}>
              <option value="">Auto (phone built-in)</option>
              {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mic'}</option>)}
            </select>
            <div class="help" style={{ marginTop: 12, marginBottom: 6 }}>Output</div>
            <select class="select" value={outId} onChange={(e) => setOutId((e.currentTarget as HTMLSelectElement).value)}>
              <option value="">System default</option>
              {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Output'}</option>)}
            </select>
            <div class="help">Output picking works on Chrome/Edge. Safari/Firefox use the system route.</div>
          </div>
        </>
      )}
    </div>
  );
}
