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
  const res = await fetch(`${PROXY_BASE}/status?identityKey=${encodeURIComponent(identityKey)}`);
  if (!res.ok) {
    throw new Error("status_fetch_failed");
  }
  const data = await res.json();
  return data.alreadyPlayed;
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
