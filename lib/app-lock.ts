/**
 * App Lock — client-side WebAuthn device-presence gate layered on top of Clerk.
 *
 * This module is pure (no React). It handles the WebAuthn ceremonies and the
 * localStorage persistence of the enrolled credential, keyed by Clerk userId.
 *
 * There is no server-side verification by design: the app is already
 * authenticated via Clerk. Resolving `verify()` means the OS platform
 * authenticator (Touch ID / Face ID / Windows Hello / Android fingerprint,
 * falling back to the device passcode) confirmed the user is present.
 */

export interface AppLockRecord {
  enabled: boolean;
  /** base64url-encoded credential rawId */
  credentialId: string;
  transports?: AuthenticatorTransport[];
}

const KEY_PREFIX = "spendly:app-lock:";
const storageKey = (userId: string) => `${KEY_PREFIX}${userId}`;

// ---------------------------------------------------------------------------
// base64url <-> ArrayBuffer (loop-based; ES2017 target has no downlevelIteration)
// ---------------------------------------------------------------------------

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// localStorage layer (SSR-guarded)
// ---------------------------------------------------------------------------

export function readRecord(userId: string): AppLockRecord | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppLockRecord;
    if (typeof parsed?.credentialId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRecord(userId: string, record: AppLockRecord): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch {
    // Ignore quota / disabled storage — the feature simply won't persist.
  }
}

export function clearRecord(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // no-op
  }
}

export function isEnabled(userId: string): boolean {
  return readRecord(userId)?.enabled === true;
}

/** True when a credential has been enrolled for this user on this device. */
export function isEnrolled(userId: string): boolean {
  return !!readRecord(userId)?.credentialId;
}

/**
 * Whether the app should lock for this user. App Lock is ON by default: a user
 * who has never made a choice (no stored record) is treated as enabled. Only an
 * explicit "disabled" record turns it off.
 */
export function isLockedByDefault(userId: string): boolean {
  const record = readRecord(userId);
  return record ? record.enabled : true;
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/**
 * True only when a platform authenticator (biometric/passcode) is usable:
 * requires a secure context (https or localhost) and WebAuthn support.
 */
export async function isSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (
    !window.PublicKeyCredential ||
    !window.isSecureContext ||
    !navigator.credentials
  ) {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// WebAuthn ceremonies
// ---------------------------------------------------------------------------

/**
 * Enrolls a platform credential for this user. Triggers the OS biometric /
 * passcode prompt. Persists and returns the resulting record.
 * Throws if the user cancels or enrollment otherwise fails.
 */
export async function enroll(userId: string): Promise<AppLockRecord> {
  if (!userId) throw new Error("Missing user");

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Spendly", id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(userId),
        name: userId,
        displayName: "Spendly App Lock",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        // Non-discoverable: we always supply the credential id at unlock, so we
        // don't need a discoverable passkey. This reduces the "save a passkey"
        // friction and keeps it a plain Windows Hello / device-biometric unlock.
        residentKey: "discouraged",
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Enrollment cancelled");

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === "function"
      ? (response.getTransports() as AuthenticatorTransport[])
      : undefined;

  const record: AppLockRecord = {
    enabled: true,
    credentialId: bufferToBase64url(credential.rawId),
    transports,
  };
  writeRecord(userId, record);
  return record;
}

/**
 * Verifies device presence for this user. Triggers the OS biometric /
 * passcode prompt (userVerification required). Resolves on success; throws on
 * cancel/failure. No server verification by design.
 */
export async function verify(userId: string): Promise<void> {
  const record = readRecord(userId);
  if (!record?.credentialId) throw new Error("Not enrolled");

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          type: "public-key",
          id: base64urlToBuffer(record.credentialId),
          transports: record.transports,
        },
      ],
      userVerification: "required",
      timeout: 60000,
    },
  });

  if (!assertion) throw new Error("Verification failed");
}
