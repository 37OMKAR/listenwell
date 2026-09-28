import { useState } from 'preact/hooks';
import { ListenScreen } from './ListenScreen';
import { HearingTest } from './HearingTest';
import { ProfileManager } from './ProfileManager';

type Tab = 'listen' | 'test' | 'profiles';

export function App() {
  const [tab, setTab] = useState<Tab>('listen');
  const [reloadKey, setReloadKey] = useState(0);
  const bumpReload = () => setReloadKey((k) => k + 1);

  return (
    <div class="app">
      {tab !== 'listen' && (
        <div class="hero">
          <div class="brand">
            <div class="logo">🎧</div>
            <div>
              <h1>ClearHear</h1>
              <div class="sub">On-device speech clarity</div>
            </div>
          </div>
        </div>
      )}
      <div class="tabs" role="tablist">
        <div class={'tab' + (tab === 'listen' ? ' active' : '')} onClick={() => setTab('listen')}>Listen</div>
        <div class={'tab' + (tab === 'test' ? ' active' : '')} onClick={() => setTab('test')}>Hearing test</div>
        <div class={'tab' + (tab === 'profiles' ? ' active' : '')} onClick={() => setTab('profiles')}>Profiles</div>
      </div>
      {tab === 'listen' && <ListenScreen key={reloadKey} />}
      {tab === 'test' && <HearingTest onApplied={() => { bumpReload(); setTab('profiles'); }} />}
      {tab === 'profiles' && (
        <>
          <ProfileManager onChange={bumpReload} />
          <div class="card">
            <h3>About</h3>
            <p>ClearHear is an assistive listening aid. It is not a medical device and does not diagnose or treat hearing conditions.</p>
            <p class="help">All audio stays on your phone. Nothing is uploaded.</p>
            <p class="help">Wear headphones. Start at low volume. Take breaks.</p>
          </div>
        </>
      )}
    </div>
  );
}
