import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { HEARING_FREQS, fitFromThresholds } from '../hearing/fitting';
import { playTone } from '../hearing/tones';
import { profiles, HearingProfile, setActiveProfile } from '../storage/profiles';
import { defaultParams, EngineParams } from '../audio/params';
import { saveSetting } from '../storage/profiles';

type Phase = 'intro' | 'calibrate' | 'testing' | 'done';

// Level search: start at LOUD_START, on "heard" go softer (10 dB), on "miss" go louder (5 dB).
// Threshold = softest level heard on 2 rising trials.
const LOUD_START = -20;
const SOFTEST = -70;
const LOUDEST = -6;

export function HearingTest({ onApplied }: { onApplied?: () => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [name, setName] = useState('');
  const [ear, setEar] = useState<'left' | 'right'>('left');
  const [freqIdx, setFreqIdx] = useState(0);
  const [level, setLevel] = useState(LOUD_START);
  const [heardCountAtLevel, setHeardCountAtLevel] = useState(0);
  const [threshLeft, setThreshLeft] = useState<number[]>(Array(6).fill(NaN));
  const [threshRight, setThreshRight] = useState<number[]>(Array(6).fill(NaN));
  const [catchTrials, setCatchTrials] = useState({ presented: 0, falsePositives: 0 });
  const [isCatch, setIsCatch] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ctx] = useState(() => new AudioContext());
  const [savedInfo, setSavedInfo] = useState<{ p: HearingProfile; fit: ReturnType<typeof fitFromThresholds> } | null>(null);
  const timer = useRef<number | undefined>();

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const totalTrials = HEARING_FREQS.length * 2; // per ear
  const doneTrials = threshLeft.filter(Number.isFinite).length + threshRight.filter(Number.isFinite).length;
  const progress = Math.min(1, doneTrials / totalTrials);

  async function playCurrent(catchTrial = false) {
    await ctx.resume();
    setPlaying(true);
    setIsCatch(catchTrial);
    const delay = 500 + Math.random() * 2000;
    await new Promise((r) => (timer.current = window.setTimeout(r, delay)));
    if (!catchTrial) {
      await playTone(ctx, { hz: HEARING_FREQS[freqIdx], levelDb: level, ear });
    } else {
      await new Promise((r) => setTimeout(r, 700));
    }
    setPlaying(false);
  }

  async function playNext() {
    // 1-in-6 chance of a silent catch trial after the first two frequencies
    const catchNow = doneTrials >= 2 && Math.random() < 0.16;
    if (catchNow) setCatchTrials((c) => ({ ...c, presented: c.presented + 1 }));
    await playCurrent(catchNow);
  }

  function record(heard: boolean) {
    if (playing) return;
    // Handle catch trial
    if (isCatch) {
      if (heard) setCatchTrials((c) => ({ ...c, falsePositives: c.falsePositives + 1 }));
      setIsCatch(false);
      return;
    }
    const heardCount = heard ? heardCountAtLevel + 1 : 0;
    if (heard && heardCount >= 2) {
      const arr = ear === 'left' ? [...threshLeft] : [...threshRight];
      arr[freqIdx] = level;
      ear === 'left' ? setThreshLeft(arr) : setThreshRight(arr);
      nextStep();
      return;
    }
    if (heard) {
      setHeardCountAtLevel(heardCount);
      setLevel(Math.max(SOFTEST, level - 10));
    } else {
      setHeardCountAtLevel(0);
      setLevel(Math.min(LOUDEST, level + 5));
    }
  }

  function nextStep() {
    setHeardCountAtLevel(0);
    setLevel(LOUD_START);
    if (freqIdx + 1 < HEARING_FREQS.length) {
      setFreqIdx(freqIdx + 1);
    } else if (ear === 'left') {
      setEar('right'); setFreqIdx(0);
    } else {
      setPhase('done');
    }
  }

  function beginTest() {
    setPhase('testing');
    setEar('left'); setFreqIdx(0); setLevel(LOUD_START); setHeardCountAtLevel(0);
    setCatchTrials({ presented: 0, falsePositives: 0 });
    setThreshLeft(Array(6).fill(NaN)); setThreshRight(Array(6).fill(NaN));
    setSavedInfo(null);
  }

  async function playCalibrationTone() {
    await ctx.resume();
    await playTone(ctx, { hz: 1000, levelDb: -20, ear: 'left', pulses: 2 });
    await playTone(ctx, { hz: 1000, levelDb: -20, ear: 'right', pulses: 2 });
  }

  async function saveAndApply(activate: boolean) {
    const fit = fitFromThresholds(threshLeft, threshRight);
    const trimmed = name.trim() || `Profile ${new Date().toLocaleDateString()}`;
    const p: HearingProfile = {
      id: 'p_' + Date.now(),
      name: trimmed,
      createdAt: Date.now(),
      thresholds: HEARING_FREQS.map((hz, i) => ({ hz, left: threshLeft[i], right: threshRight[i] })),
      gains: fit.mono,
    };
    await profiles.save(p);
    if (activate) {
      await setActiveProfile(p.id);
      // Merge recommendations into saved engine params so the Listen screen picks them up
      const merged: EngineParams = {
        ...defaultParams,
        profile: fit.mono,
        clarity: fit.recommend.clarity,
        highs: fit.recommend.highs,
        presence: fit.recommend.presence,
        air: fit.recommend.air,
        warmth: fit.recommend.warmth,
        deess: fit.recommend.deess,
      };
      await saveSetting('params', merged);
    }
    setSavedInfo({ p, fit });
    onApplied?.();
  }

  const fitPreview = useMemo(() => {
    if (phase !== 'done') return null;
    return fitFromThresholds(threshLeft, threshRight);
  }, [phase, threshLeft, threshRight]);

  // ── INTRO ──────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div class="card">
        <h3>Hearing test</h3>
        <p>About <b>4 minutes</b>. Per-ear tone thresholds at 6 pitches.<br/>The result becomes a personal EQ curve applied on top of the AI cleaner.</p>
        <ol class="help" style={{ lineHeight: 1.7 }}>
          <li>Wear the headphones you'll use with ClearHear.</li>
          <li>Sit in a quiet room. Set phone volume to ~70%.</li>
          <li>Tap <b>I heard it</b> only when you're sure. A few silent trials will slip in to catch guessing.</li>
        </ol>
        <div class="slider" style={{ marginTop: 16 }}>
          <label><span>Profile name</span></label>
          <input
            class="select"
            type="text"
            value={name}
            placeholder="e.g. Wired earbuds"
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <button class="btn big" onClick={() => setPhase('calibrate')}>Continue →</button>
      </div>
    );
  }

  // ── CALIBRATE ──────────────────────────────────────────────────────────
  if (phase === 'calibrate') {
    return (
      <div class="card">
        <h3>Volume check</h3>
        <p>Play the reference tone. It should be <b>clearly audible but comfortable</b> — like normal conversation.</p>
        <p class="help">If it's too loud, turn down your phone's volume. If you can't hear it, turn up. Don't proceed until it's comfortable.</p>
        <button class="btn big" onClick={playCalibrationTone}>▶ Play reference tone</button>
        <div class="row" style={{ marginTop: 12 }}>
          <button class="btn" onClick={beginTest}>Start test →</button>
          <button class="btn ghost" onClick={() => setPhase('intro')}>Back</button>
        </div>
      </div>
    );
  }

  // ── TESTING ────────────────────────────────────────────────────────────
  if (phase === 'testing') {
    const catchRate = catchTrials.presented > 0 ? catchTrials.falsePositives / catchTrials.presented : 0;
    return (
      <div class="card">
        <h3>Testing</h3>

        {/* Progress */}
        <div style={{ margin: '6px 0 14px' }}>
          <div class="meter" style={{ height: 8 }}>
            <div style={{ width: (progress * 100) + '%', background: 'linear-gradient(90deg,var(--accent),var(--accent-2))' }} />
          </div>
          <div class="help" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>{doneTrials} / {totalTrials} pitches</span>
            <span>{ear === 'left' ? '👈 Left ear' : 'Right ear 👉'}</span>
          </div>
        </div>

        <div style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '10px 0' }}>
          {HEARING_FREQS[freqIdx]} Hz
        </div>
        <div class="help" style={{ textAlign: 'center' }}>
          {isCatch ? '(no tone this trial — don\'t press Heard)' : `Level ${level} dB`}
        </div>

        <button
          class="btn big"
          onClick={playNext}
          disabled={playing}
          style={{ marginTop: 16, opacity: playing ? 0.6 : 1 }}
        >
          {playing ? '🔊 Listening…' : '▶ Play tone'}
        </button>
        <div class="row" style={{ marginTop: 12 }}>
          <button class="btn" onClick={() => record(true)} disabled={playing}>👂 I heard it</button>
          <button class="btn ghost" onClick={() => record(false)} disabled={playing}>Didn't hear</button>
        </div>

        {catchRate > 0.4 && catchTrials.presented >= 3 && (
          <div class="warn-box">Many false hits detected. Try to only tap "I heard it" when you're sure.</div>
        )}
        <div class="row" style={{ marginTop: 10 }}>
          <button class="btn ghost" onClick={() => setPhase('intro')}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── DONE ───────────────────────────────────────────────────────────────
  const fit = fitPreview!;
  return (
    <>
      <div class="card">
        <h3>Result</h3>
        <p>
          <b>Overall severity:&nbsp;</b>
          <span class="pill" style={{ background: fit.severity === 'none' ? 'rgba(74,222,128,0.15)' : fit.severity === 'mild' ? 'rgba(255,176,32,0.15)' : 'rgba(255,90,95,0.15)' }}>
            {fit.severity}
          </span>
        </p>
        {fit.asymmetryDb > 15 && (
          <div class="warn-box">Your ears differ by {fit.asymmetryDb.toFixed(0)} dB at high frequencies — consider seeing an audiologist.</div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr style={{ color: 'var(--muted)', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>Hz</th>
              <th style={{ padding: '6px 4px' }}>Left dB</th>
              <th style={{ padding: '6px 4px' }}>Right dB</th>
              <th style={{ padding: '6px 4px' }}>Gain</th>
            </tr>
          </thead>
          <tbody>
            {HEARING_FREQS.map((hz, i) => (
              <tr key={hz} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 4px' }}>{hz}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>{Number.isFinite(threshLeft[i]) ? threshLeft[i].toFixed(0) : '—'}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>{Number.isFinite(threshRight[i]) ? threshRight[i].toFixed(0) : '—'}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--accent)' }}>+{fit.mono[i].toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Recommended clarity settings</h3>
        <div class="help">These will replace your current Listen-tab sliders when you save & activate.</div>
        <ul style={{ margin: '10px 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Speech clarity <b>+{fit.recommend.clarity.toFixed(0)} dB</b></li>
          <li>Highs <b>+{fit.recommend.highs.toFixed(0)} dB</b></li>
          <li>Presence <b>+{fit.recommend.presence.toFixed(0)} dB</b></li>
          <li>Air <b>+{fit.recommend.air.toFixed(0)} dB</b></li>
          <li>Warmth <b>{fit.recommend.warmth >= 0 ? '+' : ''}{fit.recommend.warmth.toFixed(0)} dB</b></li>
          <li>De-ess <b>{fit.recommend.deess.toFixed(2)}</b></li>
        </ul>
      </div>

      <div class="card">
        <h3>Save this profile</h3>
        <div class="slider">
          <label><span>Name</span></label>
          <input class="select" type="text" value={name} placeholder="e.g. Wired earbuds"
                 onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </div>
        {savedInfo ? (
          <div class="info-box">✓ Saved "{savedInfo.p.name}" and applied to your Listen tab.</div>
        ) : (
          <div class="row" style={{ marginTop: 8 }}>
            <button class="btn" onClick={() => saveAndApply(true)}>💾 Save & apply</button>
            <button class="btn ghost" onClick={() => saveAndApply(false)}>Save only</button>
          </div>
        )}
        <button class="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setPhase('intro')}>
          ↻ Redo test
        </button>
        <p class="help">Relative thresholds only — not a medical audiogram.</p>
      </div>
    </>
  );
}
