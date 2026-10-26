import { getSupabase } from '@/lib/supabase';

/**
 * Optional authenticator-app sign-in (time-based one-time codes).
 *
 * Off by default. After password or Google the app opens. If the person has
 * already turned two-step on in Settings, a session at level `aal1` is held
 * on the code screen until a code lifts it to `aal2`.
 */

export type MfaStep = 'verify' | 'ok';

export interface MfaStatus {
  step: MfaStep;
  /** a verified authenticator is enrolled on this account */
  enabled: boolean;
}

interface FactorLike {
  id: string;
  status: 'verified' | 'unverified' | (string & {});
  factor_type: string;
}

function totpVerified(factors: FactorLike[]): boolean {
  return factors.some((f) => f.factor_type === 'totp' && f.status === 'verified');
}

/** Which screen the signed-in person needs next. Pure, so it is unit-tested. */
export function mfaStatus(level: { currentLevel: string | null; nextLevel: string | null } | null, factors: FactorLike[]): MfaStatus {
  const enabled = totpVerified(factors);
  if (level?.currentLevel === 'aal2') return { step: 'ok', enabled: true };
  if (enabled) return { step: 'verify', enabled: true };
  return { step: 'ok', enabled: false };
}

/** Asks the server where this session stands. Failures leave the app open. */
export async function readMfaStatus(): Promise<MfaStatus> {
  try {
    const auth = getSupabase().auth;
    const [{ data: level }, { data: factors }] = await Promise.all([auth.mfa.getAuthenticatorAssuranceLevel(), auth.mfa.listFactors()]);
    return mfaStatus(level, factors?.all ?? []);
  } catch {
    return { step: 'ok', enabled: false };
  }
}

/** Keeps digits only, at most six, so pasted "123 456" or "123-456" still works. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** Recovery codes are shown once; group them for reading aloud and writing down. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(' ') ?? code;
}

const FRIENDLY_NAME = 'Authenticator app';
const ISSUER = 'Tremor Tracker';

export interface Enrollment {
  factorId: string;
  /** shared key to type into an authenticator by hand */
  secret: string;
  /** otpauth:// link that authenticator apps on this phone can open directly */
  uri: string;
}

async function dropUnverified(): Promise<void> {
  const auth = getSupabase().auth;
  const { data: list } = await auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status === 'unverified') await auth.mfa.unenroll({ factorId: f.id });
  }
}

/** Drops a half-finished setup so leaving Settings doesn’t leave a dangling factor. */
export async function cancelEnrollment(): Promise<void> {
  try {
    await dropUnverified();
  } catch {
    /* still leaving the screen */
  }
}

/** Starts (or restarts) setting up an authenticator. Any half-finished attempt is discarded first. */
export async function startEnrollment(): Promise<{ data: Enrollment | null; error: string | null }> {
  const auth = getSupabase().auth;
  await dropUnverified();
  // issuer is set explicitly so a missing Site URL on the server doesn’t fail setup
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: FRIENDLY_NAME, issuer: ISSUER });
  if (error || !data?.totp?.secret || !data.totp.uri) {
    return { data: null, error: friendlyError(error?.code, error?.message ?? 'Could not start setup.') };
  }
  return { data: { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri }, error: null };
}

/** Removes every authenticator on the account. */
export async function disableMfa(): Promise<{ error: string | null }> {
  const { data } = await getSupabase().auth.mfa.listFactors();
  for (const f of data?.totp ?? []) {
    const { error } = await getSupabase().auth.mfa.unenroll({ factorId: f.id });
    if (error) return { error: friendlyError(error.code, error.message) };
  }
  return { error: null };
}

/** Confirms a six-digit code from the authenticator for a factor, lifting the session to aal2. */
export async function verifyCode(factorId: string, code: string): Promise<{ error: string | null }> {
  const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: normalizeCode(code) });
  if (!error) return { error: null };
  return { error: friendlyError(error.code, error.message) };
}

/** Finds the authenticator to check a code against when signing in. */
export async function verifiedFactorId(): Promise<string | null> {
  const { data } = await getSupabase().auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === 'verified')?.id ?? null;
}

/**
 * Backup codes for when the authenticator is lost. Supabase treats these as
 * experimental and they can be switched off on the server, so a failure here
 * is reported as "none" rather than as an error.
 */
export async function generateRecoveryCodes(): Promise<string[] | null> {
  try {
    const { data, error } = await getSupabase().auth.mfa.recoveryCodes.generate({ friendlyName: 'Backup codes' });
    if (error || !data) return null;
    return data.codes;
  } catch {
    return null;
  }
}

export async function verifyRecoveryCode(code: string): Promise<{ error: string | null }> {
  try {
    const { error } = await getSupabase().auth.mfa.recoveryCodes.verify({ code: code.replace(/\s|-/g, '') });
    if (!error) return { error: null };
    return { error: friendlyError(error.code, error.message) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Backup codes are not available.' };
  }
}

function friendlyError(code: string | undefined, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('qr') || lower.includes('error generating')) {
    return 'Couldn’t start two-step setup. Check that this account has an email, then try again.';
  }
  switch (code) {
    case 'mfa_verification_failed':
      return 'That code didn’t match. Check the time on your phone and try the newest code.';
    case 'mfa_recovery_codes_locked':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'mfa_challenge_expired':
      return 'That code took too long. Enter the newest one.';
    case 'insufficient_aal':
      return 'Enter a code from your authenticator first, then try again.';
    default:
      return message;
  }
}
