import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AppWindow, Clock3, Database, HardDrive, LayoutDashboard,
  ListChecks, Moon, RefreshCw, Settings, ShieldCheck, Smartphone, Sun,
  Usb, CircleHelp, CheckCircle2
} from 'lucide-react';
import { scanDevices, scanInstalledApps } from './services/deviceService';
import type { AndroidDevice, DeviceScan, AppInventory } from './types';

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
  const [inventory, setInventory] = useState<AppInventory | null>(null);
  const [appsBusy, setAppsBusy] = useState(false);
  const [appFilter, setAppFilter] = useState<'all' | 'user' | 'system' | 'unknown'>('all');
  const [appSearch, setAppSearch] = useState('');

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

  const loadApps = useCallback(async () => {
    const target = connected[0];
    if (!target) { setError('Connect and authorise an Android device before scanning its apps.'); return; }
    setAppsBusy(true); setError('');
    try { setInventory(await scanInstalledApps(target.serial)); }
    catch (e) { setError(`App inventory failed: ${String(e)}`); }
    finally { setAppsBusy(false); }
  }, [connected]);

  const visibleApps = (inventory?.apps ?? []).filter((app) =>
    (appFilter === 'all' || app.category === appFilter) &&
    app.packageName.toLowerCase().includes(appSearch.toLowerCase())
  );

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

          {active === 'App manager' && (
            <div className="inventory-panel">
              <div className="section-row">
                <div><h2>Installed application inventory</h2><p>Read-only package metadata from the selected authorised device.</p></div>
                <button className="primary-button" onClick={() => void loadApps()} disabled={appsBusy || connected.length === 0}>
                  <RefreshCw size={15} className={appsBusy ? 'spin' : ''} />{appsBusy ? 'Scanning apps…' : 'Scan installed apps'}
                </button>
              </div>
              {connected.length === 0 ? <div className="empty-state"><div className="empty-icon"><Smartphone size={25}/></div><h3>No authorised device</h3><p>Connect and authorise an Android phone, then return here to scan its installed packages.</p></div> : null}
              {inventory && (
                <>
                  <div className="inventory-summary">
                    <span><b>{inventory.apps.length}</b> packages found</span>
                    <span><b>{inventory.apps.filter(a => a.category === 'user').length}</b> user apps</span>
                    <span><b>{inventory.apps.filter(a => a.category === 'system').length}</b> system apps</span>
                    <span><b>{inventory.apps.filter(a => a.category === 'unknown').length}</b> unclassified</span>
                  </div>
                  <div className="inventory-controls">
                    <input aria-label="Search packages" placeholder="Search package name…" value={appSearch} onChange={e => setAppSearch(e.target.value)} />
                    <select aria-label="Filter app category" value={appFilter} onChange={e => setAppFilter(e.target.value as typeof appFilter)}>
                      <option value="all">All categories</option><option value="user">User apps</option><option value="system">System apps</option><option value="unknown">Unknown</option>
                    </select>
                  </div>
                  <div className="inventory-table-wrap">
                    <table className="inventory-table">
                      <thead><tr><th>Package</th><th>Category</th><th>Version code</th><th>Installer</th></tr></thead>
                      <tbody>{visibleApps.map(app => <tr key={app.packageName}>
                        <td><b>{app.packageName}</b><small>{app.apkPath ?? 'APK path not reported'}</small></td>
                        <td><span className={`category-tag ${app.category}`}>{app.category}</span></td>
                        <td>{app.versionCode ?? '—'}</td><td>{app.installer ?? 'Unknown'}</td>
                      </tr>)}</tbody>
                    </table>
                    {visibleApps.length === 0 && <p className="inventory-empty">No packages match this search and filter.</p>}
                  </div>
                  <p className="inventory-footnote">Classification is based on the reported APK path, not a safety verdict. This screen does not disable, uninstall or modify apps.</p>
                </>
              )}
            </div>
          )}
          {active === 'Debloat recommendations' && (
            <div className="empty-state"><div className="empty-icon"><ShieldCheck size={25}/></div><h3>Safety review is being built</h3><p>Recommendations will be evidence-based and informational. Unknown or preinstalled apps will not automatically be marked unsafe, and no app will be removed automatically.</p></div>
          )}


          <div className="stats-grid">
            <Stat icon={<Smartphone />} label="Connected devices" value={String(connected.length)} detail={`${devices.length} detected by ADB`} />
            <Stat icon={<AppWindow />} label="Apps scanned" value={inventory ? String(inventory.apps.length) : "—"} detail={inventory ? "Installed packages in latest scan" : "Open App manager to scan packages"} />
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
