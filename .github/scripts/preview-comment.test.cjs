const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BUILD_CONTEXT, NORTHFLANK_BOT, MARKER, getState, reconcile, resolvePullRequests } = require("./preview-comment.cjs");

const pending = { id: 1, state: "pending", created_at: "2026-09-05T01:00:00Z" };
const success = { id: 2, state: "success", created_at: "2026-09-05T01:05:00Z" };
const deployment = { id: 1, created_at: "2026-09-05T01:06:00Z" };

test("build, deployment, and failure transitions", () => {
  assert.equal(getState([], undefined, []), undefined);
  assert.equal(getState([pending], undefined, []), "🟡 Building");
  assert.equal(getState([pending, success], undefined, []), "🟡 Deploying");
  assert.equal(getState([pending, success], deployment, [{ id: 1, state: "success" }]), "🟢 Ready");
  assert.equal(getState([{ ...success, state: "failure" }], undefined, []), "🔴 Build failed");
  assert.equal(getState([success], deployment, [{ id: 1, state: "failure" }]), "🔴 Deployment failed");
  assert.equal(getState([success], deployment, [{ id: 1, state: "success" }, { id: 2, state: "inactive" }]), "⚪ Inactive");
});

test("same-SHA rebuild does not reuse the previous deployment's success", () => {
  const rebuild = { ...pending, id: 3, created_at: "2026-09-05T02:00:00Z" };
  const deployed = [{ id: 1, state: "success" }];
  assert.equal(getState([success, rebuild], deployment, deployed), "🟡 Building");
  assert.equal(getState([rebuild, { ...success, id: 4 }], deployment, deployed), "🟡 Deploying");
});

function fixture({ comments = [], moved = false, closed = false, foreign = false } = {}) {
  const calls = [];
  let reads = 0;
  const sha = "a".repeat(40);
  const pull = { state: closed ? "closed" : "open", head: { sha } };
  const github = {
    rest: {
      pulls: { get: async () => ({ data: ++reads > 1 && moved ? { ...pull, head: { sha: "b".repeat(40) } } : pull }) },
      repos: {
        listCommitStatuses: "builds", listDeployments: "deployments", listDeploymentStatuses: "statuses",
        listPullRequestsAssociatedWithCommit: "pulls"
      },
      issues: {
        listComments: "comments",
        createComment: async (args) => calls.push({ kind: "create", ...args }),
        updateComment: async (args) => calls.push({ kind: "update", ...args })
      }
    },
    paginate: async (route, args) => {
      assert.equal(args.per_page, 100);
      const creator = { login: foreign ? "someone-else" : NORTHFLANK_BOT };
      return {
        builds: [{ ...pending, context: BUILD_CONTEXT, creator, target_url: "https://app.northflank.com/builds/example" }],
        deployments: [], statuses: [], comments,
        pulls: [{ number: 7951, state: "open" }, { number: 1, state: "closed" }]
      }[route];
    }
  };
  return { github, context: { repo: { owner: "Infisical", repo: "infisical" } }, pr: 7951, calls };
}

test("creates one marked comment using current head, not event SHA", async () => {
  const f = fixture();
  f.context.payload = { sha: "old-sha" };
  await reconcile(f);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].kind, "create");
  assert.match(f.calls[0].body, /🟡 Building/);
  assert.match(f.calls[0].body, /aaaaaaa/);
  assert.match(f.calls[0].body, /pr-7951.preview.infisical.com/);
});

test("updates only its own marked comment and skips identical writes", async () => {
  const f = fixture({ comments: [
    { id: 1, user: { login: "someone-else" }, body: MARKER },
    { id: 2, user: { login: "github-actions[bot]" }, body: MARKER }
  ] });
  const body = await reconcile(f);
  assert.equal(f.calls[0].kind, "update");
  assert.equal(f.calls[0].comment_id, 2);
  const same = fixture({ comments: [{ id: 2, user: { login: "github-actions[bot]" }, body }] });
  await reconcile(same);
  assert.deepEqual(same.calls, []);
});

test("does not write for closed PRs, changed heads, or unrelated status creators", async () => {
  for (const options of [{ closed: true }, { moved: true }, { foreign: true }]) {
    const f = fixture(options);
    await reconcile(f);
    assert.deepEqual(f.calls, []);
  }
});

test("dry run renders without writing", async () => {
  const f = fixture();
  assert.match(await reconcile({ ...f, dryRun: true }), /Infisical preview/);
  assert.deepEqual(f.calls, []);
});

test("resolves Northflank events and rejects unrelated deployments", async () => {
  const f = fixture();
  f.context.eventName = "status";
  f.context.payload = { context: BUILD_CONTEXT, sha: "a".repeat(40) };
  assert.deepEqual(await resolvePullRequests(f), [7951]);
  f.context.eventName = "deployment_status";
  f.context.payload = { deployment: { creator: { login: NORTHFLANK_BOT }, environment: "pr-7951-infisical-core" } };
  assert.deepEqual(await resolvePullRequests(f), [7951]);
  f.context.payload.deployment.environment = "production";
  assert.deepEqual(await resolvePullRequests(f), []);
  f.context.payload.deployment = { creator: { login: "someone-else" }, environment: "pr-7951-infisical-core" };
  assert.deepEqual(await resolvePullRequests(f), []);
});

test("manual refresh validates PR number", async () => {
  const f = fixture();
  f.context.eventName = "workflow_dispatch";
  f.context.payload = { inputs: { pr: "7951" } };
  assert.deepEqual(await resolvePullRequests(f), [7951]);
  f.context.payload.inputs.pr = "0";
  await assert.rejects(resolvePullRequests(f), /positive integer/);
});
