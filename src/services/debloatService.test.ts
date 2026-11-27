import { describe, expect, it } from 'vitest';
import type { InstalledApp } from '../types';
import { classifyUadPackages, isValidUadDatabase, type UadDatabase } from './debloatService';

const app = (packageName: string): InstalledApp => ({ packageName, category: 'system' });

describe('UAD database validation', () => {
  it('accepts a valid package database', () => {
    expect(isValidUadDatabase({ 'com.example.app': { description: 'Example', removal: 'Recommended' } })).toBe(true);
  });
  it('rejects malformed names, arrays, and unknown risk labels', () => {
    expect(isValidUadDatabase({ 'not a package': { description: 'x', removal: 'Recommended' } })).toBe(false);
    expect(isValidUadDatabase({ 'com.example.app': { description: 'x', removal: 'Magic' } })).toBe(false);
    expect(isValidUadDatabase([])).toBe(false);
  });
});

describe('local UAD package matching', () => {
  const db: UadDatabase = {
    'com.example.safe': { description: 'Review entry', list: 'Oem', removal: 'Recommended' },
    'com.example.unsafe': { description: 'Unsafe entry', removal: 'Unsafe' },
    'com.example.base': { description: 'Base package', removal: 'Recommended', neededBy: ['com.example.client'] },
    'com.example.client': { description: 'Client package', removal: 'Recommended', dependencies: ['com.example.base'] },
  };

  it('matches package names without case sensitivity', () => {
    const result = classifyUadPackages([app('COM.EXAMPLE.SAFE')], db);
    expect(result[0].source).toBe('UAD-ng');
    expect(result[0].status).toBe('review');
  });
  it('holds unsafe packages from review recommendations', () => {
    expect(classifyUadPackages([app('com.example.unsafe')], db)[0].status).toBe('protected');
  });
  it('holds packages referenced as dependencies by installed apps', () => {
    const result = classifyUadPackages([app('com.example.base'), app('com.example.client')], db);
    expect(result[0].status).toBe('protected');
    expect(result[0].dependencyWarnings.length).toBeGreaterThan(0);
  });
  it('does not invent a removal recommendation for unlisted packages', () => {
    const result = classifyUadPackages([app('com.unknown.package')], db);
    expect(result[0].status).toBe('unlisted');
    expect(result[0].removal).toBe('Unlisted');
  });
});
