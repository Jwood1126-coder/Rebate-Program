import { describe, it, expect } from 'vitest';
import { getColumnMapping, getConfiguredDistributors } from '../column-mappings';
import { REQUIRED_FIELDS } from '../types';

describe('column-mappings', () => {
  it('returns Fastenal mapping for FAS', () => {
    const mapping = getColumnMapping('FAS');
    expect(mapping).not.toBeNull();
    expect(mapping!.distributorCode).toBe('FAS');
    expect(mapping!.name).toBe('Fastenal Claim File');
  });

  it('is case-insensitive', () => {
    expect(getColumnMapping('fas')).not.toBeNull();
    expect(getColumnMapping('Fas')).not.toBeNull();
  });

  it('returns null for unconfigured distributor', () => {
    expect(getColumnMapping('UNKNOWN')).toBeNull();
    expect(getColumnMapping('')).toBeNull();
  });

  it('Fastenal mapping covers all required fields', () => {
    const mapping = getColumnMapping('FAS')!;
    for (const field of REQUIRED_FIELDS) {
      expect(mapping.mappings[field]).toBeDefined();
      expect(mapping.mappings[field]).not.toBe('');
    }
  });

  it('lists configured distributors', () => {
    const configured = getConfiguredDistributors();
    expect(configured).toContain('FAS');
    expect(configured.length).toBeGreaterThan(0);
  });
});
