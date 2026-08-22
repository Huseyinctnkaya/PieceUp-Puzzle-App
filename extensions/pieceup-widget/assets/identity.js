const STORAGE_KEY = "pieceup_device_id";

export function getIdentityKey(root) {
  const customerId = root.dataset.customerId;
  if (customerId) {
    return `customer:${customerId}`;
  }
  let deviceId;
  try {
    deviceId = localStorage.getItem(STORAGE_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, deviceId);
    }
  } catch (err) {
    // localStorage can throw (e.g. Safari private mode, storage disabled).
    // Fall back to a non-persisted id so the widget still works for this page view.
    deviceId = crypto.randomUUID();
  }
  return `device:${deviceId}`;
}
