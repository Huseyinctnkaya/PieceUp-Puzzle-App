const PROXY_BASE = "/apps/pieceup";

export async function fetchConfig() {
  const res = await fetch(`${PROXY_BASE}/config`);
  if (!res.ok) {
    throw new Error("config_fetch_failed");
  }
  const data = await res.json();
  return data.config;
}

export async function fetchStatus(identityKey) {
  const res = await fetch(
    `${PROXY_BASE}/status?identityKey=${encodeURIComponent(identityKey)}`,
  );
  if (!res.ok) {
    throw new Error("status_fetch_failed");
  }
  const data = await res.json();
  return data.alreadyPlayed;
}

const OPEN_TRACKED_KEY = "pieceup_open_tracked";

/**
 * Reports that the shopper opened the puzzle, once per browser session.
 *
 * Deduplicated here rather than server-side because the counters are daily
 * totals with no per-visitor dimension — without this, someone opening and
 * closing the popup five times would look like five shoppers.
 *
 * Deliberately fire-and-forget: a failed analytics ping must never stop
 * someone playing.
 */
export function trackOpen() {
  try {
    if (sessionStorage.getItem(OPEN_TRACKED_KEY)) return;
    sessionStorage.setItem(OPEN_TRACKED_KEY, "1");
  } catch {
    // Private browsing can throw on sessionStorage; tracking the open twice is
    // a better outcome than not opening the puzzle.
  }
  fetch(`${PROXY_BASE}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "opened" }),
  }).catch(() => {});
}

export async function submitCompletion(identityKey) {
  const res = await fetch(`${PROXY_BASE}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identityKey }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "completion_failed");
  }
  return data.discountCode;
}
