// POST /api/status  { job } — où en est la fabrication.
// Réponse : { job, status: queued|running|done|failed, step, runUrl, apk: {name, size, url}, error }
// POST (et pas GET) : le service worker ne met jamais ces réponses en cache.

import { json, site, repo, gh, readJob, writeJob, same, WORKFLOW } from "../_shared.js";

function publicView(env, j) {
  const out = {
    job: j.job, type: j.type, status: j.status, appName: j.appName, packageName: j.packageName,
    versionName: j.versionName, versionCode: j.versionCode, createdAt: j.createdAt,
    runUrl: j.runUrl || null, error: j.error || null, step: j.step || null,
  };
  if (j.status === "done" && j.apkName) {
    out.apk = {
      name: j.apkName, size: j.apkSize || null, sha256: j.certSha256 || null,
      url: `${site(env)}/api/runner/dl?job=${j.job}&k=${j.dlKey}`,
    };
  }
  return out;
}

// Retrouve le run GitHub de la tâche (son titre commence par « [job] »).
async function findRun(env, job) {
  const r = await gh(env, `/repos/${repo(env)}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=30`);
  if (!r.ok) return null;
  const d = await r.json();
  return (d.workflow_runs || []).find(w => (w.display_title || "").includes(`[${job}]`)) || null;
}

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { /* vide */ }
  const j = await readJob(env, body.job);
  if (!j) return json({ error: "Tâche inconnue." }, 404);
  if (j.statusKey && !same(body.statusKey, j.statusKey)) return json({ error: "Tâche inconnue." }, 404);

  if (j.status === "queued" || j.status === "running") {
    // Each browser may poll frequently; avoid repeatedly hitting GitHub and
    // rewriting R2 metadata while the same build is still in progress.
    const checked = Date.parse(j.lastGitHubCheckAt || "");
    if (Number.isFinite(checked) && Date.now() - checked < 15 * 1000) {
      return json(publicView(env, j));
    }
    const run = env.GITHUB_TOKEN ? await findRun(env, j.job) : null;
    const checkedAt = new Date().toISOString();
    if (run) {
      j.runId = run.id;
      j.runUrl = run.html_url;
      if (run.status === "completed") {
        // Le workflow renvoie l'APK juste avant de finir : sans retour, c'est un échec.
        if (run.conclusion !== "success") {
          j.status = "failed";
          j.error = j.error || (run.conclusion === "cancelled" ? "Fabrication annulée." : "La fabrication a échoué : voir le détail sur GitHub.");
        } else {
          // Le workflow a réussi mais le callback peut encore être en transit.
          const finishedAt = Date.parse(run.updated_at || run.run_started_at || "");
          if (Number.isFinite(finishedAt) && Date.now() - finishedAt > 2 * 60 * 1000) {
            j.status = "failed";
            j.error = "GitHub a terminé sans confirmer l'APK sur le site. Vérifier le callback et le stockage R2.";
          } else {
            j.status = "running";
            j.step = "Finalisation du téléchargement de l'APK";
          }
        }
      } else {
        j.status = "running";
        j.step = run.status === "in_progress" ? "Fabrication en cours" : "En attente d'une machine GitHub";
      }
      // Un callback peut finaliser la tâche pendant la consultation GitHub.
      const latest = await readJob(env, j.job);
      if (latest?.status === "done" || latest?.status === "failed") {
        return json(publicView(env, latest));
      }
      j.lastGitHubCheckAt = checkedAt;
      await writeJob(env, j);
    } else if (Date.now() - Date.parse(j.createdAt) > 10 * 60 * 1000) {
      j.status = "failed";
      j.error = "Aucun run GitHub trouvé pour cette tâche après 10 minutes.";
      const latest = await readJob(env, j.job);
      if (latest?.status === "done" || latest?.status === "failed") {
        return json(publicView(env, latest));
      }
      j.lastGitHubCheckAt = checkedAt;
      await writeJob(env, j);
    } else if (env.GITHUB_TOKEN) {
      // A missing run is normal while GitHub queues the workflow.
      j.lastGitHubCheckAt = checkedAt;
      const latest = await readJob(env, j.job);
      if (latest?.status === "done" || latest?.status === "failed") {
        return json(publicView(env, latest));
      }
      await writeJob(env, j);
    }
  }
  return json(publicView(env, j));
}
