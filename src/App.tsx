import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AppWindow, Clock3, Database, HardDrive, LayoutDashboard,
  ListChecks, Moon, RefreshCw, Settings, ShieldCheck, Smartphone, Sun,
  Usb, CircleHelp, CheckCircle2
} from 'lucide-react';
import { scanDevices } from './services/deviceService';
import type { AndroidDevice, DeviceScan } from './types';

type Theme = 'dark' | 'light';
const nav = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Connected devices', icon: Smartphone },
  { label: 'App manager', icon: AppWindow },
  { label: 'Debloat recommendations', icon: ListChecks },
  { label: 'Backup & restore', icon: Database },
  { label: 'Activity history', icon: Clock3 },
  { label: 'Settings', icon: Settings },
];

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('mifask-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [active, setActive] = useState('Dashboard');
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [scan, setScan] = useState<DeviceScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem('mifask-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await scanDevices();
      setScan(result);
      setDevices(result.devices);
      if (!result.adbAvailable) setError(result.message);
      else if (result.devices.some((device) => device.state === 'unauthorized')) {
        setError('A phone is waiting for USB debugging authorisation. Unlock it and approve this computer.');
      }
    } catch (e) {
      setError(String(e));
      setScan(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const connected = devices.filter((device) => device.state === 'device');

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Smartphone size={23} /><span className="brand-spark" /></div>
          <div><b>MIFASK</b><small>ANDROID CLEANER</small></div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${active === label ? 'selected' : ''}`} onClick={() => setActive(label)}>
              <Icon size={18} /><span>{label}</span>
              {label === 'Connected devices' && <em>{devices.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-card"><ShieldCheck size={18} /><b>Safety first</b><p>Device changes require your review and confirmation.</p></div>
          <div className="version">MIFASK Android Cleaner <span>v1.0.0 · Preview</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumb">Workspace <span>/</span> <b>{active}</b></div>
          <div className="top-actions">
            <span className="offline-pill"><span /> Local-first mode</span>
            <button className="icon-button" title="Toggle theme" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="avatar">M</div>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div><div className="eyebrow">DEVICE MANAGEMENT PLATFORM</div><h1>{active}</h1><p>Inspect your Android devices and understand what is installed.</p></div>
            <button className="primary-button" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} className={busy ? 'spin' : ''} />{busy ? 'Scanning…' : 'Scan devices'}
            </button>
          </div>

          {error && <div className="notice"><CircleHelp size={18} /><div><b>ADB connection needs attention</b><p>{error}</p><small>Install Android Platform Tools, connect a phone by USB, enable USB debugging and approve this computer.</small></div></div>}

          <div className="stats-grid">
            <Stat icon={<Smartphone />} label="Connected devices" value={String(connected.length)} detail={`${devices.length} detected by ADB`} />
            <Stat icon={<AppWindow />} label="Apps scanned" value="—" detail="App inventory is the next development phase" />
            <Stat icon={<ShieldCheck />} label="Safety status" value="Protected" detail="No changes made to your phone" />
            <Stat icon={<HardDrive />} label="Saved snapshots" value="0" detail="No snapshots created yet" />
          </div>

          <div className="section-row"><div><h2>Device connections</h2><p>Phones authorised through Android Debug Bridge.</p></div><button className="text-button" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh</button></div>

          {devices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Usb size={27} /></div><h3>No Android device connected</h3>
              <p>Connect your Android phone with a USB cable. Unlock it, enable USB debugging in Developer options, then approve the computer’s RSA prompt.</p>
              <div className="steps"><span><b>01</b> Connect USB</span><span><b>02</b> Authorise PC</span><span><b>03</b> Scan again</span></div>
              {scan?.adbAvailable && <small className="muted">ADB is ready; no authorised device was returned.</small>}
            </div>
          ) : (
            <div className="device-list">
              {devices.map((device) => (
                <div className="device-row" key={device.serial}>
                  <div className="device-icon"><Smartphone /></div>
                  <div className="device-meta"><b>{device.model || device.device || 'Android device'}</b><small>{device.serial} · {device.product || 'Product unknown'}</small></div>
                  <span className={`state ${device.state === 'device' ? 'ok' : 'pending'}`}><i />{device.state}</span>
                  <button className="subtle-button" onClick={() => setActive('Connected devices')}>Inspect</button>
                </div>
              ))}
            </div>
          )}

          <div className="section-row lower"><div><h2>Built-in safeguards</h2><p>Protection is active before any package operation is introduced.</p></div></div>
          <div className="safeguard-grid">
            <Info icon={<ShieldCheck />} title="Protected package checks" text="Core Android packages are excluded from routine recommendations." />
            <Info icon={<CheckCircle2 />} title="Review before action" text="No disable or uninstall action runs without explicit approval." />
            <Info icon={<Activity />} title="Action history" text="Operations will be recorded locally for traceability." />
          </div>
          <footer>© 2026 MIFASK · Built for careful Android device management <span>ADB {scan?.adbAvailable ? 'available' : 'not detected'}</span></footer>
        </section>
      </main>
    </div>
  );
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

function Info({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="info-card"><span>{icon}</span><div><b>{title}</b><p>{text}</p></div></div>;
}

export default App;
