import {
  __STORAGE_KEY_FOR_TESTS,
  clearEnabledMap,
  loadEnabledMap,
  saveEnabledMap,
} from '../module-config-storage';

describe('module-config-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when no value is stored', () => {
    expect(loadEnabledMap()).toBeNull();
  });

  it('round-trips an enabled map', () => {
    saveEnabledMap({ webrtc: true, dns: false });
    expect(loadEnabledMap()).toEqual({ webrtc: true, dns: false });
  });

  it('ignores non-boolean values in the stored payload', () => {
    window.localStorage.setItem(
      __STORAGE_KEY_FOR_TESTS,
      JSON.stringify({ version: 2, enabled: { webrtc: true, bad: 'yes', num: 1 } })
    );
    expect(loadEnabledMap()).toEqual({ webrtc: true });
  });

  it('returns null for mismatched versions', () => {
    window.localStorage.setItem(
      __STORAGE_KEY_FOR_TESTS,
      JSON.stringify({ version: 99, enabled: { webrtc: true } })
    );
    expect(loadEnabledMap()).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    window.localStorage.setItem(__STORAGE_KEY_FOR_TESTS, '{not json');
    expect(loadEnabledMap()).toBeNull();
  });

  it('clears the stored map', () => {
    saveEnabledMap({ webrtc: true });
    clearEnabledMap();
    expect(loadEnabledMap()).toBeNull();
  });
});
