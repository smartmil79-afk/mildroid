import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AppWindow, Clock3, Database, HardDrive, LayoutDashboard,
  ListChecks, Moon, RefreshCw, Settings, ShieldCheck, Smartphone, Sun,
  Usb, CircleHelp, CheckCircle2, History, Download, Trash2, FileJson, Upload
} from 'lucide-react';
import { scanDevices, scanInstalledApps, scanDeviceHealth, configureAdbPath } from './services/deviceService';
import type { AndroidDevice, DeviceScan, AppInventory, DeviceHealth } from './types';
import { classifyInstalledApps } from './services/debloatService';
import type { DebloatRecommendation } from './services/debloatService';

type Theme = 'dark' | 'light';
type ActivityEntry = { id: string; timestamp: number; action: string; detail: string; status: 'success' | 'warning' | 'info' };
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
  const [adbPath, setAdbPath] = useState(() => localStorage.getItem('mifask-adb-path') || '');
  const [adbPathMessage, setAdbPathMessage] = useState('');
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [deviceNotice, setDeviceNotice] = useState('');
  const previousConnectedRef = useRef<Set<string>>(new Set());
  const [reviewedPackages, setReviewedPackages] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mifask-reviewed-packages') || '[]') as string[]; } catch { return []; } });
  const [scan, setScan] = useState<DeviceScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inventory, setInventory] = useState<AppInventory | null>(null);
  const [debloatResults, setDebloatResults] = useState<DebloatRecommendation[]>([]);
  const [debloatDatabaseSource, setDebloatDatabaseSource] = useState<'online' | 'cache' | null>(null);
  const [debloatDatabaseSize, setDebloatDatabaseSize] = useState(0);
  const [debloatMessage, setDebloatMessage] = useState('');
  const [debloatFilter, setDebloatFilter] = useState<'all' | 'Recommended' | 'Advanced' | 'Expert' | 'protected' | 'unlisted'>('all');
  const [debloatSearch, setDebloatSearch] = useState('');
  const [appsBusy, setAppsBusy] = useState(false);
  const [appFilter, setAppFilter] = useState<'all' | 'user' | 'system' | 'unknown'>('all');
  const [appSearch, setAppSearch] = useState('');
  const [selectedSerial, setSelectedSerial] = useState('');
  const [health, setHealth] = useState<DeviceHealth | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('mifask-activity') || '[]') as ActivityEntry[]; }
    catch { return []; }
  });

  useEffect(() => { localStorage.setItem('mifask-activity', JSON.stringify(activity.slice(0, 100))); }, [activity]);
  useEffect(() => { localStorage.setItem('mifask-reviewed-packages', JSON.stringify(reviewedPackages)); }, [reviewedPackages]);
  const recordActivity = useCallback((action: string, detail: string, status: ActivityEntry['status'] = 'success') => {
    setActivity(previous => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), action, detail, status }, ...previous].slice(0, 100));
  }, []);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupMessage, setBackupMessage] = useState('');
  const exportSettingsBackup = useCallback(() => {
    const payload = { format: 'mifask-android-cleaner-backup', version: 1, createdAt: new Date().toISOString(), settings: { theme }, activity };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `mifask-settings-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    recordActivity('Settings backup', 'Exported local preferences and activity history');
    setBackupMessage('Backup file created. It contains app preferences and activity history only.');
  }, [theme, activity, recordActivity]);
  const importSettingsBackup = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') throw new Error('The selected file is not a valid backup.');
      const data = parsed as { format?: unknown; version?: unknown; settings?: { theme?: unknown; activity?: unknown } };
      if (data.format !== 'mifask-android-cleaner-backup' || data.version !== 1 || !data.settings || !Array.isArray(data.settings.activity)) throw new Error('Unsupported backup format or version.');
      if (data.settings.theme !== 'dark' && data.settings.theme !== 'light') throw new Error('Backup theme setting is invalid.');
      const imported = data.settings.activity.slice(0, 100);
      const valid = imported.every((item): item is ActivityEntry => !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) && typeof item.action === 'string' && typeof item.detail === 'string' && ['success','warning','info'].includes(item.status));
      if (!valid) throw new Error('Backup activity records failed validation.');
      if (!window.confirm('Restore app theme and local activity history from this file? Existing local history will be replaced. No phone data will be changed.')) return;
      setTheme(data.settings.theme);
      setActivity(imported);
      recordActivity('Settings restore', 'Restored local preferences and activity history from backup');
      setBackupMessage('Backup restored successfully. No Android device data was changed.');
    } catch (e) { setBackupMessage(e instanceof Error ? e.message : 'Could not read this backup file.'); }
    finally { if (backupInputRef.current) backupInputRef.current.value = ''; }
  }, [recordActivity]);

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
      const nowConnected = new Set(result.devices.filter(device => device.state === 'device').map(device => device.serial));
      const newlyConnected = [...nowConnected].filter(serial => !previousConnectedRef.current.has(serial));
      if (newlyConnected.length) {
        const labels = result.devices.filter(device => newlyConnected.includes(device.serial)).map(device => device.model || 'Android device');
        setDeviceNotice(`${labels.join(', ')} connected successfully.`);
        recordActivity('Device connected', `${newlyConnected.length} Android device(s) authorised and connected`);
      }
      previousConnectedRef.current = nowConnected;
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
  }, [recordActivity]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => { void refresh(); }, 5000); return () => window.clearInterval(timer); }, [refresh]);
  const connected = devices.filter((device) => device.state === 'device');
  const selectedDevice = connected.find((device) => device.serial === selectedSerial) ?? connected[0];

  useEffect(() => {
    if (!connected.some((device) => device.serial === selectedSerial)) {
      setSelectedSerial(connected[0]?.serial ?? '');
    }
  }, [devices, selectedSerial]);

  const loadHealth = useCallback(async () => {
    if (!selectedDevice) { setError('Connect and authorise an Android device before running diagnostics.'); return; }
    setHealthBusy(true); setError('');
    try { setHealth(await scanDeviceHealth(selectedDevice.serial)); recordActivity('Device diagnostics', `Read-only diagnostics completed for ${selectedDevice.model || 'Android device'}`); }
    catch (e) { setError(`Device diagnostics failed: ${String(e)}`); }
    finally { setHealthBusy(false); }
  }, [selectedDevice, recordActivity]);

  useEffect(() => { setHealth(null); }, [selectedSerial]);


  const exportHealthReport = useCallback(() => {
    if (!health) return;
    const rows = [
      ['Field', 'Value'],
      ['Device serial', health.deviceSerial],
      ['Manufacturer', health.manufacturer ?? ''],
      ['Model', health.model ?? ''],
      ['Android version', health.androidVersion ?? ''],
      ['Android SDK', health.androidSdk ?? ''],
      ['One UI version', health.oneUiVersion ?? ''],
      ['Device codename', health.deviceCodename ?? ''],
      ['Security patch', health.securityPatch ?? ''],
      ['Battery level (%)', health.batteryLevel ?? ''],
      ['Battery status', health.batteryStatus ?? ''],
      ['Battery temperature (C)', health.batteryTemperatureC ?? ''],
      ['Storage total (GB)', health.storageTotalGb ?? ''],
      ['Storage used (GB)', health.storageUsedGb ?? ''],
      ['Storage free (GB)', health.storageFreeGb ?? ''],
      ['Storage used (%)', health.storageUsedPercent ?? ''],
      ['Scanned at (Unix seconds)', health.scannedAt],
    ];
    const csv = rows.map(row => row.map(value =>
      `"${String(value).replace(/"/g, '""')}"`
    ).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mifask-device-health-${health.deviceSerial.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [health]);

  const loadApps = useCallback(async () => {
    const target = selectedDevice;
    if (!target) { setError('Connect and authorise an Android device before scanning its apps.'); return; }
    setAppsBusy(true); setError('');
    try {
      const result = await scanInstalledApps(target.serial);
      setInventory(result);
      recordActivity('App inventory scan', `${result.apps.length} package(s) inspected on ${target.model || 'Android device'}`);
      setDebloatMessage('');
      try {
        const analysis = await classifyInstalledApps(result.apps);
        setDebloatResults(analysis.recommendations);
        setDebloatDatabaseSource(analysis.databaseSource);
        setDebloatDatabaseSize(analysis.databaseSize);
        recordActivity('Debloat analysis', `${analysis.recommendations.filter(item => item.source === 'UAD-ng').length} packages matched against UAD-ng`);
      } catch (analysisError) {
        setDebloatResults([]);
        setDebloatDatabaseSource(null);
        setDebloatMessage(`The installed-app scan succeeded, but the UAD-ng database could not be loaded. No bloatware ratings are being inferred. ${String(analysisError)}`);
      }
    }
    catch (e) { setError(`App inventory failed: ${String(e)}`); }
    finally { setAppsBusy(false); }
  }, [selectedDevice, recordActivity]);

  const allApps = inventory?.apps ?? [];
  const matchedDebloat = debloatResults.filter(item => item.source === 'UAD-ng');
  const debloatCounts = { Recommended: matchedDebloat.filter(item => item.removal === 'Recommended' && item.status === 'review').length, Advanced: matchedDebloat.filter(item => item.removal === 'Advanced' && item.status === 'review').length, Expert: matchedDebloat.filter(item => item.removal === 'Expert' && item.status === 'review').length, protected: matchedDebloat.filter(item => item.status === 'protected').length };
  const visibleDebloat = debloatResults.filter(item => {
    const matchesSearch = item.packageName.toLowerCase().includes(debloatSearch.toLowerCase()) || item.description.toLowerCase().includes(debloatSearch.toLowerCase());
    const matchesFilter = debloatFilter === 'all' || (debloatFilter === 'protected' ? item.status === 'protected' : debloatFilter === 'unlisted' ? item.status === 'unlisted' : item.removal === debloatFilter && item.status === 'review');
    return matchesSearch && matchesFilter;
  });
  const visibleApps = allApps.filter((app) =>
    (appFilter === 'all' || app.category === appFilter) &&
    app.packageName.toLowerCase().includes(appSearch.toLowerCase())
  );
  const appsWithoutInstaller = allApps.filter(app => app.category === 'user' && !app.installer);
  const userApps = allApps.filter(app => app.category === 'user');
  const systemApps = allApps.filter(app => app.category === 'system');
  const sourceCoverage = userApps.length
    ? Math.round(((userApps.length - appsWithoutInstaller.length) / userApps.length) * 100)
    : 0;

  const exportInventoryReport = useCallback(() => {
    if (!inventory) return;
    const rows = [
      ['Package name', 'Category', 'APK path', 'Installer', 'Version code'],
      ...inventory.apps.map(app => [
        app.packageName, app.category, app.apkPath ?? '', app.installer ?? '', app.versionCode ?? ''
      ])
    ];
    const csv = rows.map(row => row.map(value =>
      `"${String(value).replace(/"/g, '""')}"`
    ).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mifask-app-inventory-${inventory.deviceSerial.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [inventory]);

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
          {deviceNotice && <div className="device-connected-toast" role="status" aria-live="polite"><CheckCircle2 size={18}/><span><b>Device connected</b>{deviceNotice}</span><button onClick={() => setDeviceNotice('')} aria-label="Dismiss device notification">×</button></div>}
          <div className="page-heading">
            <div><div className="eyebrow">DEVICE MANAGEMENT PLATFORM</div><h1>{active}</h1><p>Inspect your Android devices and understand what is installed.</p></div>
            <button className="primary-button" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} className={busy ? 'spin' : ''} />{busy ? 'Scanning…' : 'Scan devices'}
            </button>
          </div>

          {error && <div className="notice"><CircleHelp size={18} /><div><b>ADB connection needs attention</b><p>{error}</p><small>Install Android Platform Tools, connect a phone by USB, enable USB debugging and approve this computer.</small></div></div>}

          {(active === 'Dashboard' || active === 'Connected devices') && (
            <section className="health-panel">
              <div className="section-row">
                <div><h2>Device Health &amp; Diagnostics</h2><p>Read-only battery, Android version and storage information from the selected phone.</p></div>
                <div className="inventory-actions">
                  {connected.length > 1 && <select className="device-picker" aria-label="Choose device for diagnostics" value={selectedDevice?.serial ?? ''} onChange={e => setSelectedSerial(e.target.value)}><option value="" disabled>Select device</option>{connected.map(device => <option key={device.serial} value={device.serial}>{device.model || device.serial} · {device.serial}</option>)}</select>}
                  <button className="subtle-button" onClick={exportHealthReport} disabled={!health}>Export report</button><button className="primary-button" onClick={() => void loadHealth()} disabled={healthBusy || !selectedDevice}>
                    <RefreshCw size={15} className={healthBusy ? 'spin' : ''} />{healthBusy ? 'Checking…' : 'Run diagnostics'}
                  </button>
                </div>
              </div>
              {!health ? (
                <div className="health-empty"><Smartphone size={19}/><span>{selectedDevice ? 'Run diagnostics to inspect this device.' : 'Connect and authorise a phone to view device health.'}</span></div>
              ) : (
                <>
                  <div className="health-device-line"><b>{health.manufacturer || ''} {health.model || 'Android device'}</b><span>Android {health.androidVersion || 'Unknown'}{health.oneUiVersion ? ` · One UI ${health.oneUiVersion}` : ''} · {health.deviceSerial}</span></div>
                  <div className="health-metrics">
                    <div><span className="health-icon"><Activity size={17}/></span><small>Battery level</small><strong>{health.batteryLevel == null ? '—' : `${health.batteryLevel}%`}</strong><em>{health.batteryStatus || 'Status unavailable'}</em></div>
                    <div><span className="health-icon"><Activity size={17}/></span><small>Battery temperature</small><strong>{health.batteryTemperatureC == null ? '—' : `${health.batteryTemperatureC.toFixed(1)}°C`}</strong><em>Device-reported reading</em></div>
                    <div><span className="health-icon"><HardDrive size={17}/></span><small>Storage free</small><strong>{health.storageFreeGb == null ? '—' : `${health.storageFreeGb.toFixed(1)} GB`}</strong><em>{health.storageTotalGb == null ? 'Total unavailable' : `of ${health.storageTotalGb.toFixed(1)} GB total`}</em></div>
                    <div><span className="health-icon"><ShieldCheck size={17}/></span><small>Security patch</small><strong className="patch-value">{health.securityPatch || 'Unknown'}</strong><em>Reported by Android</em></div>
                  </div>
                  {health.storageTotalGb != null && health.storageFreeGb != null && health.storageTotalGb > 0 && (
                    <div className="storage-usage">
                      <div><b>Storage usage</b><span>{(health.storageUsedPercent ?? ((health.storageTotalGb - health.storageFreeGb) / health.storageTotalGb) * 100).toFixed(1)}% used</span></div>
                      <div className="storage-track"><span style={{ width: `${Math.max(0, Math.min(100, health.storageUsedPercent ?? ((health.storageTotalGb - health.storageFreeGb) / health.storageTotalGb) * 100))}%` }} /></div>
                    </div>
                  )}
                  <p className="health-footnote">Diagnostics are read-only. Battery temperature and storage figures are reported by Android and may vary by device. Last scan: {new Date(Number(health.scannedAt) * 1000).toLocaleString()}.</p>
                </>
              )}
            </section>
          )}

          {active === 'Settings' && <section className="backup-panel"><h2>Android Debug Bridge (ADB)</h2><p>Enter the full path to adb.exe. MIFASK validates the executable before saving.</p><label htmlFor="adb-path">ADB executable path</label><input id="adb-path" className="adb-path-input" value={adbPath} onChange={e => setAdbPath(e.target.value)} placeholder="C:\\platform-tools\\adb.exe"/><div className="inventory-actions"><button className="primary-button" onClick={async () => { try { const result = await configureAdbPath(adbPath); localStorage.setItem('mifask-adb-path',adbPath.trim()); setAdbPathMessage('ADB configured: '+result); await refresh(); } catch(e) { setAdbPathMessage(String(e)); } }}>Save and test ADB</button><button className="subtle-button" onClick={async () => { setAdbPath(''); localStorage.removeItem('mifask-adb-path'); await configureAdbPath(''); await refresh(); setAdbPathMessage('Automatic detection enabled.'); }}>Automatic detection</button></div>{adbPathMessage && <p>{adbPathMessage}</p>}<p className="inventory-footnote">Try C:\\platform-tools\\adb.exe on this PC.</p></section>}

          {active === 'Backup & restore' && (
            <section className="backup-panel">
              <div className="section-row"><div><h2>Local settings backup</h2><p>Protect your MIFASK app preferences and activity history.</p></div></div>
              <div className="backup-notice"><ShieldCheck size={19}/><div><b>Safe, limited backup</b><p>This feature backs up only the app theme and local activity history. It does not copy phone photos, messages, contacts, accounts, application data or system files.</p></div></div>
              <div className="backup-actions">
                <article className="backup-card"><span className="backup-icon"><FileJson size={22}/></span><h3>Create backup</h3><p>Download a JSON file containing your current theme preference and up to 100 recent activity records.</p><button className="primary-button" onClick={exportSettingsBackup}><Download size={15}/> Export backup</button></article>
                <article className="backup-card"><span className="backup-icon"><Upload size={22}/></span><h3>Restore backup</h3><p>Choose a MIFASK backup file. The contents are validated and you must confirm before existing local history is replaced.</p><input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={e => void importSettingsBackup(e.target.files?.[0])}/><button className="subtle-button" onClick={() => backupInputRef.current?.click()}><Upload size={15}/> Choose backup file</button></article>
              </div>
              {backupMessage && <div className="backup-feedback" role="status">{backupMessage}</div>}
              <p className="inventory-footnote">Backup files are not encrypted. Store them somewhere private and do not include them in public repositories.</p>
            </section>
          )}

          {active === 'Activity history' && (
            <section className="activity-panel">
              <div className="section-row">
                <div><h2>Local activity history</h2><p>Recent scans and diagnostics recorded on this computer only. No device serial numbers or app lists are stored here.</p></div>
                <div className="inventory-actions">
                  <button className="subtle-button" onClick={() => {
                    const rows = [['Time','Action','Details','Status'], ...activity.map(item => [new Date(item.timestamp).toISOString(), item.action, item.detail, item.status])];
                    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\\r\\n');
                    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
                    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mifask-activity-history.csv'; anchor.click(); URL.revokeObjectURL(url);
                  }} disabled={activity.length === 0}><Download size={14}/> Export history</button>
                  <button className="subtle-button" onClick={() => { if (window.confirm('Clear the activity history saved on this computer?')) setActivity([]); }} disabled={activity.length === 0}><Trash2 size={14}/> Clear history</button>
                </div>
              </div>
              {activity.length === 0 ? (
                <div className="empty-state"><div className="empty-icon"><History size={24}/></div><h3>No activity recorded yet</h3><p>Device scans, app inventory scans and diagnostics will appear here.</p></div>
              ) : (
                <div className="activity-list">{activity.map(item => (
                  <article className="activity-row" key={item.id}>
                    <span className={`activity-status ${item.status}`}/>
                    <div className="activity-copy"><b>{item.action}</b><p>{item.detail}</p></div>
                    <time dateTime={new Date(item.timestamp).toISOString()}>{new Date(item.timestamp).toLocaleString()}</time>
                  </article>
                ))}</div>
              )}
              <p className="inventory-footnote">History is stored in this browser's local storage, limited to the latest 100 events, and can be cleared at any time.</p>
            </section>
          )}

          {active === 'App manager' && (
            <div className="inventory-panel">
              <div className="section-row">
                <div><h2>Installed application inventory</h2><p>Read-only package metadata from the selected authorised device.</p></div>
                <div className="inventory-actions">
                  {connected.length > 1 && <select className="device-picker" aria-label="Choose Android device" value={selectedDevice?.serial ?? ''} onChange={e => { setSelectedSerial(e.target.value); setInventory(null); }}><option value="" disabled>Select device</option>{connected.map(device => <option key={device.serial} value={device.serial}>{device.model || device.serial} · {device.serial}</option>)}</select>}
                  <button className="subtle-button" onClick={() => setActive('Debloat recommendations')} disabled={!inventory}>Open Safety Centre</button>
                  <button className="primary-button" onClick={() => void loadApps()} disabled={appsBusy || connected.length === 0}>
                    <RefreshCw size={15} className={appsBusy ? 'spin' : ''} />{appsBusy ? 'Scanning apps…' : 'Scan installed apps'}
                  </button>
                </div>
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
            <div className="safety-centre">
              <div className="section-row">
                <div><h2>Application Intelligence &amp; Safety Centre</h2><p>Evidence-based visibility into installed packages. No automatic blocking, disabling or removal.</p></div>
                <div className="inventory-actions">
                  {connected.length > 1 && <select className="device-picker" aria-label="Choose Android device" value={selectedDevice?.serial ?? ''} onChange={e => { setSelectedSerial(e.target.value); setInventory(null); }}><option value="" disabled>Select device</option>{connected.map(device => <option key={device.serial} value={device.serial}>{device.model || device.serial} · {device.serial}</option>)}</select>}
                  <button className="subtle-button" onClick={exportInventoryReport} disabled={!inventory}>Export CSV report</button>
                  <button className="primary-button" onClick={() => void loadApps()} disabled={appsBusy || connected.length === 0}>
                    <RefreshCw size={15} className={appsBusy ? 'spin' : ''} />{appsBusy ? 'Reviewing…' : 'Refresh analysis'}
                  </button>
                </div>
              </div>
              {!inventory ? (
                <div className="empty-state"><div className="empty-icon"><ShieldCheck size={25}/></div><h3>Scan installed apps to begin</h3><p>The centre needs a current read-only inventory before it can explain package categories and installer metadata.</p></div>
              ) : (
                <>
                  <div className="safety-metrics">
                    <div><small>Total packages</small><b>{allApps.length}</b></div>
                    <div><small>User-installed</small><b>{userApps.length}</b></div>
                    <div><small>System packages</small><b>{systemApps.length}</b></div>
                    <div><small>Installer metadata coverage</small><b>{sourceCoverage}%</b></div>
                  </div>
                  <div className="safety-explainer">
                    <div className="safety-explainer-icon"><ShieldCheck size={20}/></div>
                    <div><b>How to interpret this review</b><p>System/user labels are based on Android's reported APK location. Missing installer information is a visibility gap, not proof that an app is unsafe. Review unfamiliar apps using the phone's own app settings and a trusted source before taking action.</p></div>
                  </div>
                  <div className="safety-findings">
                    <h3>Items worth checking</h3>
                    {appsWithoutInstaller.length === 0 ? (
                      <div className="finding-row"><span className="finding-dot good" /><div><b>No missing installer metadata in user apps</b><p>This scan found installer metadata for every user-category package.</p></div></div>
                    ) : (
                      <>
                        <div className="finding-row"><span className="finding-dot review" /><div><b>{appsWithoutInstaller.length} user apps have no installer recorded</b><p>This can happen with preloaded, restored or manually installed apps. It is a prompt to verify the app's origin, not a malware detection.</p></div></div>
                        <div className="finding-package-list">
                          {appsWithoutInstaller.slice(0, 20).map(app => <div key={app.packageName}><code>{app.packageName}</code><span>Origin not reported</span></div>)}
                          {appsWithoutInstaller.length > 20 && <small>Showing first 20 of {appsWithoutInstaller.length} packages.</small>}
                        </div>
                      </>
                    )}
                    <div className="finding-row"><span className="finding-dot info" /><div><b>{systemApps.length} system-category packages</b><p>These are located outside the standard user-app directory. System status alone does not indicate whether a package is safe or needed.</p></div></div>
                  </div>
                  <div className="uad-panel">
                    <div className="section-row"><div><h3>UAD-ng community package intelligence</h3><p>Installed packages matched case-insensitively against the Universal Android Debloater Next Generation list.</p></div>
                      <span className={`uad-source ${debloatDatabaseSource === "online" ? "online" : "cached"}`}>{debloatDatabaseSource === "online" ? "Live database" : debloatDatabaseSource === "cache" ? "Cached database" : "Database unavailable"}</span></div>
                    {debloatMessage && <div className="backup-feedback" role="status">{debloatMessage}</div>}
                    {debloatDatabaseSource && <>
                      <div className="uad-summary"><div><small>Database entries</small><b>{debloatDatabaseSize.toLocaleString()}</b></div><div><small>Matched packages</small><b>{matchedDebloat.length}</b></div><div><small>Recommended</small><b>{debloatCounts.Recommended}</b></div><div><small>Dependency / unsafe holds</small><b>{debloatCounts.protected}</b></div></div>
                      <div className="uad-filters">
                        <button className={debloatFilter === "all" ? "selected" : ""} onClick={() => setDebloatFilter("all")}>All matched ({matchedDebloat.length})</button>
                        <button className={debloatFilter === "Recommended" ? "selected" : ""} onClick={() => setDebloatFilter("Recommended")}>Recommended ({debloatCounts.Recommended})</button>
                        <button className={debloatFilter === "Advanced" ? "selected" : ""} onClick={() => setDebloatFilter("Advanced")}>Advanced ({debloatCounts.Advanced})</button>
                        <button className={debloatFilter === "Expert" ? "selected" : ""} onClick={() => setDebloatFilter("Expert")}>Expert ({debloatCounts.Expert})</button>
                        <button className={debloatFilter === "protected" ? "selected" : ""} onClick={() => setDebloatFilter("protected")}>Protected / hold ({debloatCounts.protected})</button>\n                        <button className={debloatFilter === "unlisted" ? "selected" : ""} onClick={() => setDebloatFilter("unlisted")}>Unlisted ({debloatResults.filter(item => item.status === "unlisted").length})</button>
                      </div>
                      {visibleDebloat.length === 0 ? <p className="inventory-footnote">No packages in this category matched your installed inventory.</p> : <div className="uad-list">
                        {visibleDebloat.slice(0, 80).map(item => <article className="uad-row" key={item.packageName}>
                          <div className="uad-row-head"><b>{item.packageName}</b><span className={`uad-risk ${item.status === "protected" ? "protected" : item.removal.toLowerCase()}`}>{item.status === "protected" ? "Protected / dependency hold" : item.removal}</span></div>
                          <p>{item.description}</p><small>List: {item.list} · Source: {item.source}</small>
                          {item.dependencyWarnings.length > 0 && <div className="uad-warning">{item.dependencyWarnings.join("; ")}</div>}
                          {item.status === "review" && <div className="uad-warning">Review only. This classification is not an instruction to remove the package. MIFASK has not changed your phone.</div>}
                        </article>)}
                        {visibleDebloat.length > 80 && <p className="inventory-footnote">Showing 80 of {visibleDebloat.length} packages.</p>}
                      </div>}
                    </>}
                    <p className="inventory-footnote">Source: UAD-ng. Package matching and dependency checks run locally after downloading the public list. Your installed-app inventory is not uploaded. Unsafe and dependency-linked entries are held from recommendations. No package operation is available in this phase.</p>
                  </div>
                  <div className="debloat-review">
                    <div className="section-row"><div><h3>Safe debloat review queue</h3><p>Review user-installed packages individually. MIFASK does not uninstall, disable or alter apps.</p></div><span className="review-count">{userApps.length - reviewedPackages.filter(name => userApps.some(app => app.packageName === name)).length} to review</span></div>
                    {userApps.length === 0 ? <p className="inventory-footnote">Run an app inventory scan to create a review queue.</p> : <div className="review-app-list">
                      {userApps.map(app => <div className="review-app-row" key={app.packageName}>
                        <div><b>{app.packageName}</b><small>{app.installer ? `Installer: ${app.installer}` : 'Installer not reported'} · {app.versionCode ? `Version ${app.versionCode}` : 'Version unavailable'}</small></div>
                        <label><input type="checkbox" checked={reviewedPackages.includes(app.packageName)} onChange={e => setReviewedPackages(previous => e.target.checked ? [...previous, app.packageName] : previous.filter(name => name !== app.packageName))}/> Reviewed</label>
                      </div>)}
                    </div>}
                    <p className="inventory-footnote">A user-app label does not mean an app is unnecessary. Check its purpose and dependencies in Android Settings before deciding what to keep. System packages are not placed in this queue.</p>
                  </div>
                  <p className="inventory-footnote">Analysis timestamp (UTC epoch seconds): {inventory.scannedAt}. This centre does not upload app lists, classify apps using cloud reputation services, or modify the connected device.</p>
                </>
              )}
            </div>
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
                  <button className="subtle-button" onClick={() => { setSelectedSerial(device.serial); setActive('App manager'); }}>Inspect apps</button>
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
