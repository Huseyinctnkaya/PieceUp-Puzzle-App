const STORAGE_KEY = "pieceup_device_id";

export function getIdentityKey(root) {
  const customerId = root.dataset.customerId;
  if (customerId) {
    return `customer:${customerId}`;
  }
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return `device:${deviceId}`;
}
