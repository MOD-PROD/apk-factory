// POST /api/runner/cleanup - bounded, authorized physical deletion of expired
// APK Factory R2 jobs. Only the jobs/ namespace is ever scanned or deleted.
import { json, same, JOB_RE, JOB_RETENTION_MS } from "../../_shared.js";

const MAX_JOBS_PER_CALL = 75;
const MAX_PAGES = 5;

function createdFromId(id) {
  if (!JOB_RE.test(id)) return null;
  const date = id.slice(0, 8), clock = id.slice(9, 13);
  const y = Number(date.slice(0, 4)), month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8)), hour = Number(clock.slice(0, 2));
  const minute = Number(clock.slice(2, 4));
  const value = Date.UTC(y, month - 1, day, hour, minute);
  const d = new Date(value);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day || d.getUTCHours() !== hour ||
      d.getUTCMinutes() !== minute) return null;
  return value;
}

async function deleteJob(env, prefix, now) {
  const key = prefix + "job.json";
  const record = await env.FILES.get(key);
  let created = createdFromId(prefix.slice(5, -1));
  if (record) {
    let metadata;
    try { metadata = await record.json(); } catch { return 0; }
    if (metadata?.job !== prefix.slice(5, -1)) return 0;
    const timestamp = Date.parse(metadata.createdAt || "");
    if (!Number.isFinite(timestamp)) return 0;
    created = timestamp;
  }
  if (!Number.isFinite(created) || now - created < JOB_RETENTION_MS) return 0;

  let cursor, page = 0, deleted = 0;
  do {
    const list = await env.FILES.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    const names = (list.objects || []).map(o => o.key)
      .filter(key => key.startsWith(prefix) && key.length > prefix.length);
    if (names.length) {
      await env.FILES.delete(names);
      deleted += names.length;
    }
    cursor = list.truncated ? list.cursor : undefined;
    page++;
  } while (cursor && page < MAX_PAGES);
  // If an extraordinarily large job still has objects, the next scheduled run retries.
  return deleted;
}

export async function onRequestPost({ request, env }) {
  const auth = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.CALLBACK_TOKEN || !same(auth, env.CALLBACK_TOKEN))
    return json({ error: "Non autorisé." }, 401);
  if (!env.FILES?.list || !env.FILES?.delete)
    return json({ error: "Stockage R2 indisponible." }, 503);

  const now = Date.now();
  let cursor, pages = 0, jobs = 0, objects = 0;
  do {
    const listed = await env.FILES.list({
      prefix: "jobs/", delimiter: "/", limit: 250,
      ...(cursor ? { cursor } : {})
    });
    for (const prefix of listed.delimitedPrefixes || []) {
      const match = /^jobs\/(\d{8}-\d{4}-[0-9a-f]{6})\/$/.exec(prefix);
      if (!match) continue;
      const date = createdFromId(match[1]);
      // Ignore future/new jobs and malformed names, never traverse other prefixes.
      if (date === null || now - date < JOB_RETENTION_MS) continue;
      objects += await deleteJob(env, prefix, now);
      jobs++;
      if (jobs >= MAX_JOBS_PER_CALL) break;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
    pages++;
  } while (cursor && pages < MAX_PAGES && jobs < MAX_JOBS_PER_CALL);
  return json({ ok: true, jobsScanned: jobs, objectsDeleted: objects,
    more: Boolean(cursor) || jobs >= MAX_JOBS_PER_CALL });
}
