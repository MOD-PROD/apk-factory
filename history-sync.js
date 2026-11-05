// Portable, minimal job metadata for the user's own Google Drive.
// Never export APK download URLs or Cloudflare / Google OAuth tokens.
const JOB = /^\d{8}-\d{4}-[a-f0-9]{6}$/;
const STATUS_KEY = /^[a-f0-9]{48}$/;
const STATES = new Set(["queued", "running", "done", "failed"]);
const MAX_HISTORY = 50;

export function sanitizeHistory(items) {
  if (!Array.isArray(items)) return [];
  const map = new Map();
  for (const item of items.slice(0, 500)) {
    if (!item || typeof item !== "object" || !JOB.test(item.job || "")) continue;
    const created = Date.parse(item.createdAt || "");
    if (!Number.isFinite(created)) continue;
    const value = {
      job: item.job,
      createdAt: new Date(created).toISOString(),
      appName: String(item.appName || "").slice(0, 50),
      packageName: String(item.packageName || "").slice(0, 150),
      form: item.form === "atv" ? "atv" : "web",
      status: STATES.has(item.status) ? item.status : "queued",
      ...(STATUS_KEY.test(item.statusKey || "") ? { statusKey: item.statusKey } : {})
    };
    const previous = map.get(value.job);
    // Prefer whichever entry has the status key; preserve terminal status.
    if (!previous || (!previous.statusKey && value.statusKey) ||
        (previous.statusKey === value.statusKey && 
         ["done", "failed"].includes(value.status) &&
         !["done", "failed"].includes(previous.status))) {
      map.set(value.job, value);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_HISTORY);
}

export function mergeHistory(local, remote) {
  // Local records are prioritized for matching job IDs, except that a remote
  // statusKey is preserved when missing locally.
  return sanitizeHistory([...sanitizeHistory(local), ...sanitizeHistory(remote)]);
}
