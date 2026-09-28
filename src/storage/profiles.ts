import { get, set, del, keys } from 'idb-keyval';

export interface HearingProfile {
  id: string;
  name: string;
  createdAt: number;
  thresholds: { hz: number; left: number; right: number }[]; // dB SPL rel to reference
  gains: number[]; // 6-band, applied per-mono for now (v1)
}

const KEY = (id: string) => `profile:${id}`;

export const profiles = {
  async save(p: HearingProfile) { await set(KEY(p.id), p); },
  async load(id: string) { return (await get(KEY(id))) as HearingProfile | undefined; },
  async remove(id: string) { await del(KEY(id)); },
  async list() {
    const ks = await keys();
    const out: HearingProfile[] = [];
    for (const k of ks) {
      if (typeof k === 'string' && k.startsWith('profile:')) {
        const v = (await get(k)) as HearingProfile | undefined;
        if (v) out.push(v);
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
};

export async function saveSetting<T>(k: string, v: T) { await set('setting:' + k, v); }
export async function loadSetting<T>(k: string): Promise<T | undefined> {
  return (await get('setting:' + k)) as T | undefined;
}
