import { useEffect, useState } from 'preact/hooks';
import { profiles, HearingProfile, setActiveProfile, loadSetting, saveSetting } from '../storage/profiles';
import { defaultParams, EngineParams } from '../audio/params';
import { fitFromThresholds } from '../hearing/fitting';

export function ProfileManager({ onChange }: { onChange?: () => void }) {
  const [list, setList] = useState<HearingProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function refresh() {
    setList(await profiles.list());
    setActiveId((await loadSetting<string | null>('activeProfileId')) ?? null);
  }
  useEffect(() => { void refresh(); }, []);

  async function activate(p: HearingProfile) {
    await setActiveProfile(p.id);
    const left = p.thresholds.map((t) => t.left);
    const right = p.thresholds.map((t) => t.right);
    const fit = fitFromThresholds(left, right);
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
    await refresh();
    onChange?.();
  }

  async function deactivate() {
    await setActiveProfile(null);
    await saveSetting('params', defaultParams);
    await refresh();
    onChange?.();
  }

  async function remove(p: HearingProfile) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await profiles.remove(p.id);
    if (activeId === p.id) await deactivate();
    else await refresh();
  }

  return (
    <div class="card">
      <h3>Hearing profiles</h3>
      {list.length === 0 ? (
        <p class="help">No profiles yet. Take the hearing test to create one.</p>
      ) : (
        <div>
          {list.map((p) => {
            const isActive = p.id === activeId;
            return (
              <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
                <div class="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name} {isActive && <span class="pill" style={{ color: 'var(--good)' }}>● active</span>}</div>
                    <div class="help">{new Date(p.createdAt).toLocaleString()}</div>
                    <div class="help">Gains: {p.gains.map((g) => `+${g.toFixed(0)}`).join(' · ')} dB</div>
                  </div>
                  <div class="row" style={{ flex: '0 0 auto' }}>
                    {!isActive ? (
                      <button class="btn" onClick={() => activate(p)}>Activate</button>
                    ) : (
                      <button class="btn ghost" onClick={deactivate}>Deactivate</button>
                    )}
                    <button class="btn ghost" onClick={() => remove(p)}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
