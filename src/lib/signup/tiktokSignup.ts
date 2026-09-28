import { getSupabase } from '@/lib/supabase';

/**
 * TIKTOK-FIRST SIGNUP, the browser's half.
 *
 * Rashid's flow: "Continue with TikTok" first, then thank them and ask for
 * email and password with the handle already filled in, then the normal
 * application.
 *
 * ═══ THE SECRET NEVER LEAVES THIS BROWSER ═══
 *
 * TikTok does not offer PKCE to web apps — their docs say `code_verifier` is
 * "required for mobile and desktop app only" — so there is no standard way to
 * prove that the browser finishing the round trip is the one that began it.
 * The substitute: this file generates a secret, keeps it in sessionStorage, and
 * sends only its SHA-256 to the server. The secret itself is presented once, at
 * the end. A stolen `state`, or a stolen authorisation code, is not enough.
 *
 * sessionStorage rather than localStorage on purpose: it dies with the tab,
 * which is the right lifetime for something that is worthless twenty minutes
 * later and should not outlive the attempt.
 */

const KEY_SECRET = 'wurx-tiktok-signup-secret';
const KEY_PENDING = 'wurx-tiktok-signup-pending';
/* Set when a TikTok signup is in flight, so the shared OAuth callback page
   knows this return belongs to signup and not to the creator Settings connect.
   Both arrive at the same address today, because a second redirect URI has to
   be registered on the TikTok app first. */
const KEY_INFLIGHT = 'wurx-tiktok-signup-inflight';

export type PendingIdentity = {
  ticket: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hex(new Uint8Array(buf));
}

/* Every read is wrapped: storage throws in a private window and in some in-app
   browsers, and a creator on a phone is exactly who this is for. Losing the
   secret means starting again, never a wrong identity. */
function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
}
function drop(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

export function signupInFlight(): boolean {
  return read(KEY_INFLIGHT) === '1';
}

/** What TikTok has already vouched for in this tab, if anything. */
export function pendingIdentity(): PendingIdentity | null {
  const raw = read(KEY_PENDING);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingIdentity;
    return p && typeof p.ticket === 'string' ? p : null;
  } catch { return null; }
}

export function forgetIdentity() {
  drop(KEY_PENDING);
  drop(KEY_SECRET);
  drop(KEY_INFLIGHT);
}

/** Send them to TikTok. Returns nothing: the browser leaves. */
export async function startTikTokSignup(): Promise<void> {
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
  write(KEY_SECRET, secret);
  write(KEY_INFLIGHT, '1');

  const { data, error } = await getSupabase().functions.invoke('tiktok-signup', {
    body: { action: 'start', browserSecretHash: await sha256Hex(secret) },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error(data?.error ?? 'Could not start that. Try again.');
  window.location.assign(data.url as string);
}

/**
 * Finish the round trip: hand back the code and the secret, keep the ticket.
 * Called by the OAuth callback page, which has the code from `window.__wxOAuthReturn`.
 */
export async function finishTikTokSignup(code: string, state: string): Promise<PendingIdentity> {
  const secret = read(KEY_SECRET);
  if (!secret) {
    /* The tab that started this is gone — usually TikTok's in-app browser
       handing the return to a different browser. Safe, never a wrong identity,
       and one tap from starting again. */
    throw new Error('Open the sign-up page again in this browser and press Continue with TikTok.');
  }
  const { data, error } = await getSupabase().functions.invoke('tiktok-signup', {
    body: { action: 'finish', code, state, browserSecret: secret },
  });
  if (error) {
    /* functions.invoke hides the body on a non-2xx; the server's sentence is
       the only thing worth showing here, so it is dug out. */
    const ctx = (error as { context?: Response }).context;
    let msg = error.message;
    try { const j = ctx ? await ctx.json() : null; if (j?.error) msg = j.error; } catch { /* keep */ }
    throw new Error(msg);
  }
  if (!data?.ticket) throw new Error(data?.error ?? 'TikTok could not confirm that.');

  const identity: PendingIdentity = {
    ticket: data.ticket as string,
    handle: (data.handle as string | null) ?? null,
    displayName: (data.displayName as string | null) ?? null,
    avatarUrl: (data.avatarUrl as string | null) ?? null,
  };
  write(KEY_PENDING, JSON.stringify(identity));
  drop(KEY_INFLIGHT);
  return identity;
}

/**
 * Attach the proven identity to the account that now exists.
 *
 * Called AFTER `signUp` has succeeded and the browser holds a session — which
 * is the whole point: Supabase issued that session, not us.
 */
export async function claimTikTokSignup(): Promise<{ handle: string | null } | null> {
  const identity = pendingIdentity();
  const secret = read(KEY_SECRET);
  if (!identity || !secret) return null;

  const { data, error } = await getSupabase().functions.invoke('tiktok-signup', {
    body: { action: 'claim', ticket: identity.ticket, browserSecret: secret },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = error.message;
    try { const j = ctx ? await ctx.json() : null; if (j?.error) msg = j.error; } catch { /* keep */ }
    throw new Error(msg);
  }
  forgetIdentity();
  return { handle: (data?.handle as string | null) ?? null };
}
