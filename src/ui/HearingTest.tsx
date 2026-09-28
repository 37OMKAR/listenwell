import { useState } from 'preact/hooks';
import { HEARING_FREQS, fitFromThresholds } from '../hearing/fitting';
import { playTone } from '../hearing/tones';
import { profiles, HearingProfile } from '../storage/profiles';

type Phase = 'idle' | 'testing' | 'done';

export function HearingTest() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [ear, setEar] = useState<'left' | 'right'>('left');
  const [freqIdx, setFreqIdx] = useState(0);
  const [level, setLevel] = useState(-20);
  const [heardCountAtLevel, setHeardCountAtLevel] = useState(0);
  const [threshLeft, setThreshLeft] = useState<number[]>(Array(6).fill(NaN));
  const [threshRight, setThreshRight] = useState<number[]>(Array(6).fill(NaN));
  const [ctx] = useState(() => new AudioContext());

  async function playCurrent() {
    await ctx.resume();
    await playTone(ctx, { hz: HEARING_FREQS[freqIdx], levelDb: level, ear });
  }

  function record(heard: boolean) {
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
      setLevel(level - 10);
    } else {
      setHeardCountAtLevel(0);
      setLevel(level + 5);
    }
  }

  function nextStep() {
    setHeardCountAtLevel(0);
    setLevel(-20);
    if (freqIdx + 1 < HEARING_FREQS.length) {
      setFreqIdx(freqIdx + 1);
    } else if (ear === 'left') {
      setEar('right'); setFreqIdx(0);
    } else {
      setPhase('done');
    }
  }

  function begin() {
    setPhase('testing');
    setEar('left'); setFreqIdx(0); setLevel(-20); setHeardCountAtLevel(0);
    setThreshLeft(Array(6).fill(NaN)); setThreshRight(Array(6).fill(NaN));
  }

  async function saveProfile() {
    const { mono } = fitFromThresholds(threshLeft, threshRight);
    const p: HearingProfile = {
      id: 'p_' + Date.now(),
      name: 'Profile ' + new Date().toLocaleDateString(),
      createdAt: Date.now(),
      thresholds: HEARING_FREQS.map((hz, i) => ({ hz, left: threshLeft[i], right: threshRight[i] })),
      gains: mono,
    };
    await profiles.save(p);
    alert('Saved: ' + p.name);
  }

  if (phase === 'idle') {
    return (
      <div class="card">
        <div class="h1">Hearing test</div>
        <p class="muted">
          Wear the headphones you'll use with ClearHear. Sit in a quiet room. About 4 minutes.
        </p>
        <button class="btn big" onClick={begin}>Start test</button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div class="card">
        <div class="h1">Result</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th>Hz</th><th>Left dB</th><th>Right dB</th></tr></thead>
          <tbody>
            {HEARING_FREQS.map((hz, i) => (
              <tr key={hz}>
                <td>{hz}</td>
                <td>{Number.isFinite(threshLeft[i]) ? threshLeft[i].toFixed(0) : '—'}</td>
                <td>{Number.isFinite(threshRight[i]) ? threshRight[i].toFixed(0) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="row" style={{ marginTop: 12 }}>
          <button class="btn" onClick={saveProfile}>Save profile</button>
          <button class="btn ghost" onClick={() => setPhase('idle')}>Redo</button>
        </div>
        <p class="muted">Relative thresholds only, not a medical audiogram.</p>
      </div>
    );
  }

  return (
    <div class="card">
      <div class="h1">{ear === 'left' ? 'Left ear' : 'Right ear'} · {HEARING_FREQS[freqIdx]} Hz</div>
      <p class="muted">Level {level} dB</p>
      <button class="btn big" onClick={playCurrent}>▶ Play tone</button>
      <div class="row" style={{ marginTop: 12 }}>
        <button class="btn" onClick={() => record(true)}>I heard it</button>
        <button class="btn ghost" onClick={() => record(false)}>Didn't hear</button>
      </div>
    </div>
  );
}
