import type { InstalledApp } from '../types';

const UAD_LIST_URL = 'https://raw.githubusercontent.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation/main/resources/assets/uad_lists.json';
const CACHE_KEY = 'mifask-uad-list-cache-v1';
const CACHE_TIME_KEY = 'mifask-uad-list-cache-time-v1';
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type UadRemoval = 'Recommended' | 'Advanced' | 'Expert' | 'Unsafe' | 'Unlisted';
export type DebloatRecommendation = {
  packageName: string;
  description: string;
  list: string;
  removal: UadRemoval;
  dependencies: string[];
  neededBy: string[];
  dependencyWarnings: string[];
  source: 'UAD-ng' | 'Unlisted';
  status: 'review' | 'protected' | 'unlisted';
};

type UadPackage = {
  list?: string;
  description?: string;
  removal?: string;
  dependencies?: string[];
  neededBy?: string[];
};

type UadDatabase = Record<string, UadPackage>;

function isDatabase(value: unknown): value is UadDatabase {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 && entries.every(([, item]) =>
    !!item && typeof item === 'object' &&
    typeof (item as UadPackage).description === 'string' &&
    typeof (item as UadPackage).removal === 'string'
  );
}

function readCache(): UadDatabase | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const savedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
    if (!raw || !savedAt || Date.now() - savedAt > MAX_CACHE_AGE_MS) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDatabase(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function loadDatabase(): Promise<{ database: UadDatabase; source: 'online' | 'cache' }> {
  try {
    const response = await fetch(UAD_LIST_URL, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error(`UAD-ng database request failed (HTTP ${response.status}).`);
    const parsed: unknown = await response.json();
    if (!isDatabase(parsed)) throw new Error('The downloaded UAD-ng database did not pass validation.');
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch {
      // Continue with the validated in-memory copy if browser storage is full.
    }
    return { database: parsed, source: 'online' };
  } catch (error) {
    const cached = readCache();
    if (cached) return { database: cached, source: 'cache' };
    throw error instanceof Error ? error : new Error('Could not load the UAD-ng database.');
  }
}

export async function classifyInstalledApps(apps: InstalledApp[]): Promise<{
  recommendations: DebloatRecommendation[];
  databaseSource: 'online' | 'cache';
  databaseSize: number;
}> {
  const { database, source } = await loadDatabase();
  const keys = new Map(Object.keys(database).map(key => [key.toLowerCase(), key]));
  const installed = new Set(apps.map(app => app.packageName.toLowerCase()));

  const recommendations = apps.map(app => {
    const canonicalKey = keys.get(app.packageName.toLowerCase());
    const entry = canonicalKey ? database[canonicalKey] : undefined;
    if (!entry) {
      return {
        packageName: app.packageName,
        description: 'No matching entry was found in the UAD-ng community list. No removal recommendation is available.',
        list: 'Unlisted',
        removal: 'Unlisted' as const,
        dependencies: [],
        neededBy: [],
        dependencyWarnings: [],
        source: 'Unlisted' as const,
        status: 'unlisted' as const,
      };
    }

    const dependencies = Array.isArray(entry.dependencies) ? entry.dependencies : [];
    const neededBy = Array.isArray(entry.neededBy) ? entry.neededBy : [];
    const dependencyWarnings = new Set<string>();

    for (const packageName of neededBy) {
      if (installed.has(packageName.toLowerCase()) && packageName.toLowerCase() !== app.packageName.toLowerCase()) {
        dependencyWarnings.add(`Required by installed package ${packageName}`);
      }
    }
    for (const other of apps) {
      if (other.packageName.toLowerCase() === app.packageName.toLowerCase()) continue;
      const otherEntry = database[keys.get(other.packageName.toLowerCase()) || ''];
      if (otherEntry?.dependencies?.some(name => name.toLowerCase() === app.packageName.toLowerCase())) {
        dependencyWarnings.add(`Listed as a dependency of installed package ${other.packageName}`);
      }
    }

    const rawRemoval = String(entry.removal || 'Unlisted');
    const removal = (['Recommended', 'Advanced', 'Expert', 'Unsafe'].includes(rawRemoval) ? rawRemoval : 'Unlisted') as UadRemoval;
    const blocked = removal === 'Unsafe' || dependencyWarnings.size > 0;
    return {
      packageName: app.packageName,
      description: entry.description || 'No description supplied by UAD-ng.',
      list: entry.list || 'Unlisted',
      removal,
      dependencies,
      neededBy,
      dependencyWarnings: [...dependencyWarnings],
      source: 'UAD-ng' as const,
      status: blocked ? 'protected' as const : 'review' as const,
    };
  });

  return { recommendations, databaseSource: source, databaseSize: Object.keys(database).length };
}
