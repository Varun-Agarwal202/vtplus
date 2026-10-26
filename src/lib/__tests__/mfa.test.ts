import { formatRecoveryCode, mfaStatus, normalizeCode } from '../mfa';

jest.mock('../supabase', () => ({ supabaseConfigured: false, getSupabase: jest.fn() }));

const verified = { id: 'a', status: 'verified', factor_type: 'totp' };
const unverified = { id: 'b', status: 'unverified', factor_type: 'totp' };

describe('mfaStatus', () => {
  test('a session already at the second level is done, with two-step on', () => {
    expect(mfaStatus({ currentLevel: 'aal2', nextLevel: 'aal2' }, [verified])).toEqual({ step: 'ok', enabled: true });
  });
  test('a first-level session with a verified authenticator needs a code', () => {
    expect(mfaStatus({ currentLevel: 'aal1', nextLevel: 'aal2' }, [verified])).toEqual({ step: 'verify', enabled: true });
  });
  test('no authenticator means the app opens — two-step is off', () => {
    expect(mfaStatus({ currentLevel: 'aal1', nextLevel: 'aal1' }, [])).toEqual({ step: 'ok', enabled: false });
    expect(mfaStatus({ currentLevel: 'aal1', nextLevel: 'aal1' }, [unverified])).toEqual({ step: 'ok', enabled: false });
    expect(mfaStatus(null, [])).toEqual({ step: 'ok', enabled: false });
  });
  test('a recovery-code factor alone does not turn two-step on', () => {
    expect(mfaStatus({ currentLevel: 'aal1', nextLevel: 'aal2' }, [{ id: 'r', status: 'verified', factor_type: 'recovery_code' }])).toEqual({
      step: 'ok',
      enabled: false,
    });
  });
});

test('normalizeCode keeps six digits and drops separators', () => {
  expect(normalizeCode('123 456')).toBe('123456');
  expect(normalizeCode('12-34-56-78')).toBe('123456');
  expect(normalizeCode('abc')).toBe('');
});

test('formatRecoveryCode groups in fours', () => {
  expect(formatRecoveryCode('abcdefgh')).toBe('abcd efgh');
  expect(formatRecoveryCode('abcdefghij')).toBe('abcd efgh ij');
});
