const BUILD_CONTEXT = "northflank/infisical/infisical-preview/infisical-core";
const NORTHFLANK_BOT = "northflank-cloud-build-run[bot]";
const MARKER = "<!-- infisical-northflank-preview -->";

function newest(items) {
  return items.reduce((latest, item) => !latest || item.id > latest.id ? item : latest, undefined);
}

function getState(builds, deployment, statuses) {
  const build = newest(builds);
  if (build?.state === "pending") return "🟡 Building";
  if (["failure", "error"].includes(build?.state)) return "🔴 Build failed";

  // A rebuild of the same SHA must not inherit an earlier deployment's success.
  const started = newest(builds.filter((item) => item.state === "pending"));
  const current = deployment && (!started || deployment.created_at >= started.created_at);
  const status = current ? newest(statuses) : undefined;
  if (status?.state === "success") return "🟢 Ready";
  if (["failure", "error"].includes(status?.state)) return "🔴 Deployment failed";
  if (status?.state === "inactive") return "⚪ Inactive";
  if (build?.state === "success" || current) return "🟡 Deploying";
  return undefined;
}

function northflankLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "app.northflank.com") {
      return url.href.replaceAll("(", "%28").replaceAll(")", "%29");
    }
  } catch {}
  return undefined;
}

async function resolvePullRequests({ github, context }) {
  if (context.eventName === "workflow_dispatch") {
    const number = Number(context.payload.inputs.pr);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error("PR must be a positive integer");
    return [number];
  }
  if (context.eventName === "deployment_status") {
    const deployment = context.payload.deployment;
    if (deployment.creator?.login !== NORTHFLANK_BOT) return [];
    const match = /^pr-([1-9]\d*)-infisical-core$/.exec(deployment.environment);
    return match ? [Number(match[1])] : [];
  }
  if (context.eventName !== "status" || context.payload.context !== BUILD_CONTEXT) return [];
  const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...context.repo, commit_sha: context.payload.sha, per_page: 100
  });
  return pulls.filter((pr) => pr.state === "open").map((pr) => pr.number);
}

async function reconcile({ github, context, pr, dryRun = false }) {
  const repo = context.repo;
  const { data: pull } = await github.rest.pulls.get({ ...repo, pull_number: pr });
  if (pull.state !== "open") return;
  const sha = pull.head.sha;
  // Read current API state instead of replaying the triggering event. Delayed
  // events and queued runs therefore reconcile the latest commit/build.
  const builds = (await github.paginate(github.rest.repos.listCommitStatuses, {
    ...repo, ref: sha, per_page: 100
  })).filter((item) => item.context === BUILD_CONTEXT && item.creator?.login === NORTHFLANK_BOT);
  const deployments = await github.paginate(github.rest.repos.listDeployments, {
    ...repo, sha, environment: `pr-${pr}-infisical-core`, per_page: 100
  });
  const deployment = newest(deployments.filter((item) => item.creator?.login === NORTHFLANK_BOT));
  const statuses = deployment ? (await github.paginate(github.rest.repos.listDeploymentStatuses, {
    ...repo, deployment_id: deployment.id, per_page: 100
  })).filter((item) => item.creator?.login === NORTHFLANK_BOT) : [];
  const state = getState(builds, deployment, statuses);
  if (!state) return;

  const buildLink = northflankLink(newest(builds)?.target_url);
  const deploymentLink = northflankLink(newest(statuses)?.log_url);
  const body = [
    MARKER,
    "## Infisical preview",
    "",
    "| Status | Preview | Commit |",
    "| --- | --- | --- |",
    `| ${state} | [Open preview](https://pr-${pr}.preview.infisical.com) | [\`${sha.slice(0, 7)}\`](https://github.com/${repo.owner}/${repo.repo}/commit/${sha}) |`,
    "",
    [buildLink && `[Build logs](${buildLink})`, deploymentLink && `[Deployment](${deploymentLink})`].filter(Boolean).join(" · "),
    "",
    "This comment updates automatically. While building or deploying, the preview may still serve the previous version."
  ].join("\n");
  if (dryRun) return body;

  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo, issue_number: pr, per_page: 100
  });
  const existing = comments.find((comment) => comment.user?.login === "github-actions[bot]" && comment.body?.startsWith(MARKER));
  // Recheck after the API reads in case another commit was pushed meanwhile.
  const { data: latest } = await github.rest.pulls.get({ ...repo, pull_number: pr });
  if (latest.state !== "open" || latest.head.sha !== sha) return;
  if (existing) {
    if (existing.body !== body) await github.rest.issues.updateComment({ ...repo, comment_id: existing.id, body });
  } else {
    await github.rest.issues.createComment({ ...repo, issue_number: pr, body });
  }
  return body;
}

module.exports = { BUILD_CONTEXT, NORTHFLANK_BOT, MARKER, getState, resolvePullRequests, reconcile };
