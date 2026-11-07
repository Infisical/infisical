import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { Socket } from "node:net";

import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { recordingChainHead } from "@app/ee/services/pam-session-recording/pam-web-recording-fns";
import { KeyStorePrefixes } from "@app/keystore/keystore";

import { setPamConnectionTestFailure } from "e2e-test/fakes/pam-gateway-connection-test";
import { fakeS3Bucket } from "e2e-test/fakes/s3";
import { createAwsAppConnection } from "e2e-test/testUtils/app-connections";
import {
  claimPamWebAppFixture,
  createPamFixture,
  createPamReconciler,
  createWebAppAccount,
  pamRequest
} from "e2e-test/testUtils/pam";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "e2e-test/testUtils/users";

describe("PAM Web App sessions", () => {
  let fixture: Awaited<ReturnType<typeof createPamFixture>>;
  let account: Awaited<ReturnType<typeof createWebAppAccount>>;
  const sessions: string[] = [];
  const users: string[] = [];
  beforeAll(async () => {
    fixture = await createPamFixture();
    account = await createWebAppAccount(fixture);
  }, 120_000);
  afterEach(async () => {
    setPamConnectionTestFailure(false);
    fakeS3Bucket.failsAccessCheckWith(null);
    for (const id of sessions.splice(0))
      await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${id}/end`).raw();
  });
  afterAll(async () => {
    if (fixture) await fixture.cleanup();
    await deleteUsers(users);
  }, 120_000);

  const launch = async (accountId = account.accountId, key = randomUUID(), authToken = fixture.authToken) => {
    const response = await pamRequest(authToken, "POST", "/api/v1/pam/web-app-sessions", {
      accountId,
      idempotencyKey: key
    }).raw();
    expect(response.statusCode, response.payload).toBe(201);
    const sessionId = response.json().session.id as string;
    sessions.push(sessionId);
    return { sessionId, key };
  };
  const worker = async (accountId = account.accountId, authToken = fixture.authToken) => {
    const { sessionId } = await launch(accountId, randomUUID(), authToken);
    await claimPamWebAppFixture(sessionId, fixture.gatewayId);
    const credentials = await pamRequest(
      fixture.gatewayToken,
      "GET",
      `/api/v1/pam/sessions/${sessionId}/credentials`
    ).raw();
    expect(credentials.statusCode, credentials.payload).toBe(200);
    const uploadToken = credentials.json().recording.uploadToken as string;
    const state = (reportSeq: number, state: string, overrides: Record<string, unknown> = {}) =>
      pamRequest(fixture.gatewayToken, "POST", `/api/v1/pam/sessions/${sessionId}/web-app/state`, {
        reportSeq,
        allocationGen: 1,
        controllerGen: 0,
        state,
        chunksEmitted: 0,
        lastFrameSeq: 0,
        uploadToken,
        ...overrides
      }).raw();
    return { sessionId, uploadToken, state, credentials: credentials.json() };
  };
  const chunk = (sessionId: string, uploadToken: string, index = 0, body = randomBytes(32)) => ({
    chunkIndex: index,
    startElapsedMs: index * 100,
    endElapsedMs: (index + 1) * 100,
    ciphertextSha256: createHash("sha256").update(body).digest("base64"),
    ciphertextBytes: body.length,
    iv: randomBytes(12).toString("base64"),
    ciphertext: body.toString("base64"),
    body,
    uploadToken
  });
  const upload = (
    sessionId: string,
    data: ReturnType<typeof chunk> | Record<string, unknown>,
    token = fixture.gatewayToken
  ) => {
    const { body: _body, ...payload } = data;
    return testServer.inject({
      method: "POST",
      url: `/api/v1/pam/sessions/${sessionId}/chunks`,
      headers: { authorization: `Bearer ${token}`, "x-gateway-upload-token": String(data.uploadToken) },
      body: payload
    });
  };
  const terminal = (sessionId: string, uploadToken: string, overrides: Record<string, unknown> = {}) =>
    pamRequest(fixture.gatewayToken, "POST", `/api/v1/pam/sessions/${sessionId}/recording/final`, {
      chunksEmitted: 1,
      lastEndElapsedMs: 100,
      gaps: [],
      droppedCaptureFrames: 0,
      droppedMoves: 0,
      terminalEventIncluded: true,
      uploadToken,
      ...overrides
    }).raw();
  const seal = (sessionId: string, uploadToken: string, digest: string, overrides: Record<string, unknown> = {}) =>
    pamRequest(fixture.gatewayToken, "POST", `/api/v1/pam/sessions/${sessionId}/recording/finalize`, {
      chunkCount: 1,
      lastEndElapsedMs: 100,
      endReason: "user-ended",
      chainHeadBase64: recordingChainHead([Buffer.from(digest, "base64")]).toString("base64"),
      uploadToken,
      ...overrides
    }).raw();

  test("verifies inline browser chunks larger than the default HTTP body limit", async () => {
    const remote = await worker();
    const data = chunk(remote.sessionId, remote.uploadToken, 0, randomBytes(1024 * 1024 + 16));
    const uploaded = await upload(remote.sessionId, data);
    expect(uploaded.statusCode, uploaded.payload).toBe(200);
    const stored = await testDb<{
      sessionId: string;
      ciphertextBytes: number;
      encryptedEventsBlob: Buffer;
      verifiedSha256: Buffer;
    }>(TableName.PamSessionEventChunk)
      .where({ sessionId: remote.sessionId })
      .first();
    expect(Number(stored?.ciphertextBytes)).toBe(data.body.length);
    expect(stored?.encryptedEventsBlob.equals(data.body)).toBe(true);
    expect(stored?.verifiedSha256.toString("base64")).toBe(data.ciphertextSha256);
  });

  test("deleting the owner revokes a live browser and preserves its history without an owner", async () => {
    const user = await createUser("pam-deleted-owner");
    users.push(user.userId);
    await addUserMembership({ userId: user.userId, orgId: fixture.orgId, role: OrgMembershipRole.Member });
    await pamRequest(fixture.authToken, "POST", "/api/v1/pam/memberships/users", {
      userIds: [user.userId],
      role: "member"
    });
    await pamRequest(fixture.authToken, "POST", `/api/v1/pam/folders/${fixture.folderId}/users/${user.userId}`, {
      role: "operator"
    });
    const token = await createUserAccessToken({ userId: user.userId, orgId: fixture.orgId });
    const remote = await worker(account.accountId, token);
    expect((await remote.state(1, "provisioned")).statusCode).toBe(200);
    expect((await remote.state(2, "recording-ready")).statusCode).toBe(200);
    expect((await remote.state(3, "active")).statusCode).toBe(200);
    const deleted = await pamRequest(token, "DELETE", "/api/v2/users/me").raw();
    expect(deleted.statusCode, deleted.payload).toBe(200);
    const view = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/web-app-sessions/${remote.sessionId}`).raw();
    expect(view.statusCode, view.payload).toBe(200);
    expect(view.json().session.status).toBe("terminated");
    expect(view.json().session.webApp.workerState).toBe("ending");
    const row = await testDb("pam_web_app_sessions").where({ sessionId: remote.sessionId }).first();
    expect(row.createdByUserId).toBeNull();
    const refused = await pamRequest(
      fixture.authToken,
      "POST",
      `/api/v1/pam/web-app-sessions/${remote.sessionId}/attach-tickets`,
      {}
    ).raw();
    expect(refused.statusCode).toBe(403);
    const report = await remote.state(4, "stopped");
    expect(report.statusCode, report.payload).toBe(200);
    expect(report.json().cancel).toBe(true);
  });
  test("finalize and playback project recording metadata without loading ciphertext blobs", async () => {
    const remote = await worker();
    const data = chunk(remote.sessionId, remote.uploadToken);
    expect((await upload(remote.sessionId, data)).statusCode).toBe(200);
    await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${remote.sessionId}/end`);
    expect((await remote.state(1, "stopped")).statusCode).toBe(200);
    expect((await terminal(remote.sessionId, remote.uploadToken)).statusCode).toBe(200);
    const queries: string[] = [];
    const capture = ({ sql }: { sql: string }) => {
      if (sql.startsWith("select ") && sql.includes('from "pam_session_event_chunks"')) queries.push(sql);
    };
    testDb.on("query", capture);
    try {
      const sealed = await seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256);
      expect(sealed.statusCode, sealed.payload).toBe(200);
      expect(sealed.json().manifest.status).toBe("complete");
      const playback = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/sessions/${remote.sessionId}/playback`).raw();
      expect(playback.statusCode, playback.payload).toBe(200);
      expect(playback.json().availability.verifiedChunks).toBe(1);
    } finally {
      testDb.removeListener("query", capture);
    }
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const sql of queries) {
      expect(sql).not.toContain("*");
      expect(sql.replace('"encryptedEventsBlob" IS NOT NULL AS "hasCiphertext"', "")).not.toContain("encryptedEventsBlob");
    }
  });

  test("advertises Web App and binds launch retries before one-time checks", async () => {
    const { sessionId, key } = await launch();
    const retry = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/web-app-sessions", {
      accountId: account.accountId,
      idempotencyKey: key
    }).raw();
    expect(retry.statusCode).toBe(201);
    expect(retry.json().session.id).toBe(sessionId);
    const conflict = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/web-app-sessions", {
      accountId: account.accountId,
      idempotencyKey: key,
      reason: "different"
    }).raw();
    expect(conflict.statusCode).toBe(409);
    await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${sessionId}/end`);
    const ended = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/web-app-sessions", {
      accountId: account.accountId,
      idempotencyKey: key
    }).raw();
    expect(ended.statusCode).toBe(409);
  });
  test("does not activate credentials early and returns the immutable session policy", async () => {
    const remote = await worker();
    expect(remote.credentials.accountType).toBe("web-app");
    expect(remote.credentials.leaseSeconds).toBeGreaterThan(0);
    expect(remote.credentials.leaseSeconds).toBeLessThanOrEqual(45);
    expect(remote.credentials.webAppPolicy).not.toHaveProperty("allowPaste");
    expect(remote.credentials.recording).not.toHaveProperty("inputTextKey");
    expect(remote.credentials.connectionDetails.startOrigin).toBe("https://fixture.pam.local:443");
    const view = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/web-app-sessions/${remote.sessionId}`).raw();
    expect(view.json().session.status).toBe("starting");
    expect(view.json().session.startedAt).toBeNull();
  });
  test("confirms a never-allocated browser immediately when ended before attach", async () => {
    const { sessionId } = await launch();
    const ended = await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${sessionId}/end`).raw();
    expect(ended.statusCode, ended.payload).toBe(200);
    expect(ended.json().session.webApp).toMatchObject({
      allocationGen: 0,
      workerState: "stopped",
      workerStateReason: "never-allocated",
      stopConfirmation: "confirmed"
    });
    expect(ended.json().session.recording.state).toBe("unavailable");
    const row = await testDb("pam_web_app_sessions").where({ sessionId }).first();
    expect(row.stopConfirmedAt).toBeTruthy();
  });
  test("retries a launch after its one-time MFA proof has been consumed", async () => {
    const protectedAccount = await createWebAppAccount(fixture, {
      policies: { "require-mfa": true, "require-reason": true }
    });
    const body = {
      accountId: protectedAccount.accountId,
      reason: "Review configuration",
      idempotencyKey: randomUUID()
    };
    const challenge = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/web-app-sessions", body).raw();
    expect(challenge.statusCode, challenge.payload).toBe(400);
    const { mfaSessionId } = challenge.json().details;
    const key = KeyStorePrefixes.MfaSession(mfaSessionId);
    const proof = JSON.parse((await testRedis.get(key))!);
    // The shared MFA suite verifies the challenge; this fixture starts at its verified result to test consumption.
    await testRedis.set(key, JSON.stringify({ ...proof, status: "ACTIVE" }), "EX", 60);
    const first = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/web-app-sessions", {
      ...body,
      mfaSessionId
    }).raw();
    expect(first.statusCode, first.payload).toBe(201);
    sessions.push(first.json().session.id);
    expect(await testRedis.get(key)).toBeNull();
    const retry = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/web-app-sessions", body).raw();
    expect(retry.statusCode, retry.payload).toBe(201);
    expect(retry.json().session.id).toBe(first.json().session.id);
    const ticket = await pamRequest(
      fixture.authToken,
      "POST",
      `/api/v1/pam/web-app-sessions/${first.json().session.id}/attach-tickets`,
      {}
    ).raw();
    expect(ticket.statusCode, ticket.payload).toBe(200);
  });
  test("tickets are owner-only, single-use, origin-checked and session-bound", async () => {
    const { sessionId } = await launch();
    const created = await pamRequest(
      fixture.authToken,
      "POST",
      `/api/v1/pam/web-app-sessions/${sessionId}/attach-tickets`,
      {}
    ).raw();
    expect(created.statusCode).toBe(200);
    const user = await createUser("pam-other");
    users.push(user.userId);
    await addUserMembership({ userId: user.userId, orgId: fixture.orgId, role: OrgMembershipRole.Member });
    const token = await createUserAccessToken({ userId: user.userId, orgId: fixture.orgId });
    const refused = await pamRequest(
      token,
      "POST",
      `/api/v1/pam/web-app-sessions/${sessionId}/attach-tickets`,
      {}
    ).raw();
    expect(refused.statusCode).toBe(403);
    const deniedLaunch = await pamRequest(token, "POST", "/api/v1/pam/web-app-sessions", {
      accountId: account.accountId
    }).raw();
    expect(deniedLaunch.statusCode, deniedLaunch.payload).toBe(403);
    const deniedReview = await pamRequest(token, "GET", `/api/v1/pam/sessions/${sessionId}/playback`).raw();
    expect(deniedReview.statusCode, deniedReview.payload).toBe(403);
    const ticket = created.json().ticket as string;
    const origin = "http://localhost:3001";
    const upgrade = async (targetSession: string, targetOrigin: string) => {
      const socket = await testServer.injectWS(
        `/api/v1/pam/web-app-sessions/${targetSession}/attach?ticket=${ticket}`,
        { socket: new Socket(), headers: { origin: targetOrigin, host: "localhost", "x-real-ip": "127.0.0.1" } }
      );
      const [code] = await once(socket, "close");
      expect(code).toBe(4001);
    };
    await upgrade(sessionId, "https://wrong.example");
    const ticketRow = () =>
      testDb("pam_web_app_attach_tickets")
        .where({ tokenHash: createHash("sha256").update(ticket).digest() })
        .first();
    expect((await ticketRow()).consumedAt).toBeNull();
    await upgrade(randomUUID(), origin);
    expect((await ticketRow()).consumedAt).toBeNull();
    await upgrade(sessionId, origin);
    const consumed = (await ticketRow()).consumedAt;
    expect(consumed).toBeTruthy();
    await upgrade(sessionId, origin);
    expect((await ticketRow()).consumedAt).toEqual(consumed);
  });
  test("refuses legacy CLI and legacy WebSocket ticket issuance", async () => {
    const cli = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/sessions/access", {
      path: `web-apps/${account.accountName}`
    }).raw();
    expect(cli.statusCode, cli.payload).toBe(400);
    const ticket = await pamRequest(
      fixture.authToken,
      "POST",
      `/api/v1/pam/accounts/${account.accountId}/web-access-ticket`,
      {}
    ).raw();
    expect(ticket.statusCode).toBe(400);
  });
  test("claims one allocation across concurrent authorized attachments", async () => {
    const { sessionId } = await launch();
    const tickets = await Promise.all(
      [0, 1].map(() =>
        pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${sessionId}/attach-tickets`, {}).raw()
      )
    );
    await Promise.all(
      tickets.map(async (ticket) => {
        expect(ticket.statusCode, ticket.payload).toBe(200);
        const socket = await testServer.injectWS(
          `/api/v1/pam/web-app-sessions/${sessionId}/attach?ticket=${ticket.json().ticket}`,
          {
            socket: new Socket(),
            headers: { origin: "http://localhost:3001", host: "localhost", "x-real-ip": "127.0.0.1" }
          }
        );
        await once(socket, "close");
      })
    );
    const record = await testDb("pam_web_app_sessions").where({ sessionId }).first();
    expect(record.allocationGen).toBe(1);
    expect(record.workerState).toBe("failed");
    expect(record.workerStateReason).toBe("gateway-unreachable");
    expect(record.stopConfirmedAt).toBeNull();
  });
  test("refuses expired tickets without consuming them", async () => {
    const { sessionId } = await launch();
    const issued = await pamRequest(
      fixture.authToken,
      "POST",
      `/api/v1/pam/web-app-sessions/${sessionId}/attach-tickets`,
      {}
    ).raw();
    expect(issued.statusCode, issued.payload).toBe(200);
    await testDb("pam_web_app_attach_tickets")
      .where({ sessionId })
      .update({ expiresAt: new Date(Date.now() - 1000) });
    const socket = await testServer.injectWS(
      `/api/v1/pam/web-app-sessions/${sessionId}/attach?ticket=${issued.json().ticket}`,
      {
        socket: new Socket(),
        headers: { origin: "http://localhost:3001", host: "localhost", "x-real-ip": "127.0.0.1" }
      }
    );
    expect((await once(socket, "close"))[0]).toBe(4001);
    const row = await testDb("pam_web_app_attach_tickets").where({ sessionId }).first();
    expect(row.consumedAt).toBeNull();
  });
  test("participant JWTs cannot report worker state or write evidence", async () => {
    const remote = await worker();
    const data = chunk(remote.sessionId, remote.uploadToken);
    for (const url of [
      `${remote.sessionId}/web-app/state`,
      `${remote.sessionId}/recording/final`,
      `${remote.sessionId}/recording/finalize`,
      `${remote.sessionId}/chunks`,
      `${remote.sessionId}/chunks/presigned-put`
    ]) {
      const response = await pamRequest(fixture.authToken, "POST", `/api/v1/pam/sessions/${url}`, data).raw();
      expect(response.statusCode, response.payload).toBe(403);
    }
  });
  test.each(["expired-session", "revoked-login"])(
    "refuses %s at ticket consumption before allocation",
    async (scenario) => {
      const { sessionId } = await launch();
      const issued = await pamRequest(
        fixture.authToken,
        "POST",
        `/api/v1/pam/web-app-sessions/${sessionId}/attach-tickets`,
        {}
      ).raw();
      expect(issued.statusCode, issued.payload).toBe(200);
      if (scenario === "expired-session")
        await testDb(TableName.PamSession)
          .where({ id: sessionId })
          .update({ expiresAt: new Date(Date.now() - 1000) });
      else await testDb("pam_web_app_attach_tickets").where({ sessionId }).update({ tokenVersionId: randomUUID() });
      const socket = await testServer.injectWS(
        `/api/v1/pam/web-app-sessions/${sessionId}/attach?ticket=${issued.json().ticket}`,
        {
          socket: new Socket(),
          headers: { origin: "http://localhost:3001", host: "localhost", "x-real-ip": "127.0.0.1" }
        }
      );
      expect((await once(socket, "close"))[0]).toBe(4001);
      expect((await testDb("pam_web_app_sessions").where({ sessionId }).first()).allocationGen).toBe(0);
    }
  );
  test("fences stale reports and permits stop confirmation after failure", async () => {
    const remote = await worker();
    expect((await remote.state(1, "provisioned", { uploadToken: "invalid" })).statusCode).toBe(400);
    expect((await remote.state(1, "provisioned", { allocationGen: 2 })).statusCode).toBe(403);
    expect((await remote.state(1, "provisioned", { controllerGen: 1 })).statusCode).toBe(409);
    expect((await remote.state(1, "provisioned")).statusCode).toBe(200);
    const reports = await Promise.all([remote.state(2, "recording-ready"), remote.state(2, "recording-ready")]);
    expect(reports.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(reports[0].json().cancel).toBe(false);
    expect((await remote.state(2, "recording-ready")).statusCode).toBe(200);
    expect((await remote.state(1, "provisioned")).statusCode).toBe(409);
    expect((await remote.state(3, "failed", { reason: "worker-lost" })).statusCode).toBe(200);
    const failed = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/web-app-sessions/${remote.sessionId}`).raw();
    expect(failed.json().session.webApp.stopConfirmedAt).toBeNull();
    expect((await remote.state(4, "recording-ready")).json().cancel).toBe(true);
    expect((await remote.state(5, "stopped")).statusCode).toBe(200);
    const stopped = await pamRequest(
      fixture.authToken,
      "GET",
      `/api/v1/pam/web-app-sessions/${remote.sessionId}`
    ).raw();
    expect(stopped.json().session.webApp.stopConfirmation).toBe("confirmed");
    expect(stopped.json().session.webApp.workerStateReason).toBe("worker-lost");
  });
  test("fails a previously allocated session when its gateway reference was removed", async () => {
    const remote = await worker();
    await testDb("pam_web_app_sessions").where({ sessionId: remote.sessionId }).update({ gatewayId: null });
    const response = await remote.state(1, "provisioned");
    expect(response.statusCode, response.payload).toBe(200);
    expect(response.json().cancel).toBe(true);
    const view = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/web-app-sessions/${remote.sessionId}`).raw();
    expect(view.json().session.webApp).toMatchObject({
      workerState: "failed",
      workerStateReason: "gateway-removed",
      allocationGen: 1
    });
  });
  test("accepts pre-active detach as a heartbeat and returns relative leases", async () => {
    const remote = await worker();
    for (const [seq, state, expected] of [
      [1, "detached", "provisioning"],
      [2, "provisioned", "provisioned"],
      [3, "detached", "provisioned"],
      [4, "recording-ready", "recording-ready"],
      [5, "detached", "recording-ready"],
      [6, "active", "active"],
      [7, "detached", "detached"]
    ] as const) {
      const report = await remote.state(seq, state);
      expect(report.statusCode, report.payload).toBe(200);
      expect(report.json().leaseSeconds).toBeGreaterThan(0);
      expect(report.json().leaseSeconds).toBeLessThanOrEqual(45);
      const row = await testDb("pam_web_app_sessions").where({ sessionId: remote.sessionId }).first();
      expect(row.workerState).toBe(expected);
      expect(row.workerReportSeq).toBe(seq);
    }
  });
  test("renews an existing provisioning allocation on reattach without another claim", async () => {
    const remote = await worker();
    await testDb("pam_web_app_sessions")
      .where({ sessionId: remote.sessionId })
      .update({ leaseUntil: new Date(Date.now() - 1000) });
    const ticket = await pamRequest(
      fixture.authToken,
      "POST",
      `/api/v1/pam/web-app-sessions/${remote.sessionId}/attach-tickets`,
      {}
    ).raw();
    expect(ticket.statusCode, ticket.payload).toBe(200);
    const socket = await testServer.injectWS(
      `/api/v1/pam/web-app-sessions/${remote.sessionId}/attach?ticket=${ticket.json().ticket}`,
      {
        socket: new Socket(),
        headers: { origin: "http://localhost:3001", host: "localhost", "x-real-ip": "127.0.0.1" }
      }
    );
    await once(socket, "close");
    const row = await testDb("pam_web_app_sessions").where({ sessionId: remote.sessionId }).first();
    expect(row.allocationGen).toBe(1);
    expect(row.workerState).toBe("provisioning");
    expect(row.leaseUntil.getTime()).toBeGreaterThan(Date.now());
  });
  test("sweeps expired allocations with no report and preserves reported or renewed ones", async () => {
    const [expired, reported, renewed] = await Promise.all([worker(), worker(), worker()]);
    expect((await reported.state(1, "provisioned")).statusCode).toBe(200);
    await testDb("pam_web_app_sessions")
      .whereIn("sessionId", [expired.sessionId, reported.sessionId])
      .update({ leaseUntil: new Date(Date.now() - 1000) });
    const reconciler = createPamReconciler();
    expect(await reconciler.reconcileUnreportedWebApps()).toBe(1);
    const row = await testDb("pam_web_app_sessions").where({ sessionId: expired.sessionId }).first();
    expect(row).toMatchObject({ workerState: "failed", workerStateReason: "no-gateway-report", stopConfirmedAt: null });
    for (const sessionId of [reported.sessionId, renewed.sessionId])
      expect((await testDb("pam_web_app_sessions").where({ sessionId }).first()).workerState).not.toBe("failed");
    expect(await reconciler.reconcileUnreportedWebApps()).toBe(0);
  });
  test("sweeps a lingering ending row that never allocated a worker", async () => {
    const { sessionId } = await launch();
    await testDb("pam_web_app_sessions").where({ sessionId }).update({ workerState: "ending" });
    expect(await createPamReconciler().reconcileUnreportedWebApps()).toBe(1);
    const view = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/web-app-sessions/${sessionId}`).raw();
    expect(view.statusCode, view.payload).toBe(200);
    expect(view.json().session.webApp).toMatchObject({
      workerState: "stopped",
      workerStateReason: "never-allocated",
      stopConfirmation: "confirmed"
    });
    expect(view.json().session.recording.state).toBe("unavailable");
  });
  test("cancels a report whose remaining hard-expiry lease rounds below one second", async () => {
    const remote = await worker();
    await testDb(TableName.PamSession)
      .where({ id: remote.sessionId })
      .update({ expiresAt: new Date(Date.now() + 800) });
    const report = await remote.state(1, "provisioned");
    expect(report.statusCode, report.payload).toBe(200);
    expect(report.json()).toMatchObject({ leaseSeconds: 0, cancel: true });
  });
  test("revocation prevents a late active report and bounds the lease", async () => {
    const remote = await worker();
    const response = await remote.state(1, "provisioned");
    expect(new Date(response.json().leaseUntil).getTime()).toBeLessThanOrEqual(Date.now() + 45_000);
    await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${remote.sessionId}/end`);
    expect((await testDb("pam_web_app_sessions").where({ sessionId: remote.sessionId }).first()).workerState).toBe(
      "ending"
    );
    expect((await remote.state(2, "active")).statusCode).toBe(409);
    expect((await remote.state(3, "stopped")).statusCode).toBe(200);
  });
  test("verifies bytes, serializes chunk conflicts and seals atomically", async () => {
    const remote = await worker();
    const data = chunk(remote.sessionId, remote.uploadToken);
    expect(
      (await upload(remote.sessionId, { ...data, ciphertext: Buffer.alloc(32).toString("base64") })).statusCode
    ).toBe(400);
    const concurrent = await Promise.all([upload(remote.sessionId, data), upload(remote.sessionId, data)]);
    expect(concurrent.map((response) => response.statusCode)).toEqual([200, 200]);
    expect((await upload(remote.sessionId, { ...data, endElapsedMs: 101 })).statusCode).toBe(409);
    expect((await seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256)).statusCode).toBe(400);
    await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${remote.sessionId}/end`);
    await remote.state(1, "stopped");
    expect((await terminal(remote.sessionId, remote.uploadToken)).statusCode).toBe(200);
    const seals = await Promise.all([
      seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256),
      seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256)
    ]);
    const sealed = seals[0];
    expect(seals[1].statusCode, seals[1].payload).toBe(200);
    expect(seals[1].json().manifest.canonicalSha256).toBe(sealed.json().manifest.canonicalSha256);
    expect(sealed.statusCode, sealed.payload).toBe(200);
    expect(sealed.json().manifest.status).toBe("complete");
    expect(sealed.json().manifest.signature).toBeTruthy();
    expect((await upload(remote.sessionId, data)).statusCode).toBe(200);
    expect((await upload(remote.sessionId, chunk(remote.sessionId, remote.uploadToken, 1))).statusCode).toBe(409);
    expect(
      (await seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256)).json().manifest.canonicalSha256
    ).toBe(sealed.json().manifest.canonicalSha256);
    const playback = await pamRequest(
      fixture.authToken,
      "GET",
      `/api/v1/pam/sessions/${remote.sessionId}/playback`
    ).raw();
    expect(playback.statusCode, playback.payload).toBe(200);
    expect(playback.json().integrity.manifestSignatureVerified).toBe(true);
    const keys = await pamRequest(fixture.authToken, "GET", "/api/v1/pam/recording-signing-keys").raw();
    expect(keys.statusCode, keys.payload).toBe(200);
    expect(
      keys.json().keys.find((key: { id: string }) => key.id === sealed.json().manifest.signingKeyId).publicKeyPem
    ).toContain("BEGIN PUBLIC KEY");
  });
  test.each(["recording-failed", "unconfirmed", "chain-mismatch"])(
    "preserves an honest %s recording status",
    async (scenario) => {
      const remote = await worker();
      const data = chunk(remote.sessionId, remote.uploadToken);
      await upload(remote.sessionId, data);
      if (scenario !== "unconfirmed") {
        await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${remote.sessionId}/end`);
        await remote.state(1, "stopped");
      }
      await terminal(remote.sessionId, remote.uploadToken, { recordingFailed: scenario === "recording-failed" });
      const sealed = await seal(
        remote.sessionId,
        remote.uploadToken,
        data.ciphertextSha256,
        scenario === "chain-mismatch" ? { chainHeadBase64: Buffer.alloc(32).toString("base64") } : {}
      );
      expect(sealed.statusCode, sealed.payload).toBe(200);
      expect(sealed.json().manifest.status).toBe(scenario === "chain-mismatch" ? "mismatch" : "incomplete");
      const originalDigest =
        scenario === "chain-mismatch"
          ? Buffer.alloc(32).toString("base64")
          : recordingChainHead([Buffer.from(data.ciphertextSha256, "base64")]).toString("base64");
      const retry = await seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256, {
        chainHeadBase64: originalDigest
      });
      expect(retry.statusCode, retry.payload).toBe(200);
      const different = await seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256, {
        chainHeadBase64: Buffer.alloc(32, 1).toString("base64")
      });
      expect(different.statusCode, different.payload).toBe(409);
    }
  );
  test("retains verified playback and the frozen storage after account deletion", async () => {
    const disposable = await createWebAppAccount(fixture);
    const remote = await worker(disposable.accountId);
    const data = chunk(remote.sessionId, remote.uploadToken);
    expect((await upload(remote.sessionId, data)).statusCode).toBe(200);
    await pamRequest(fixture.authToken, "POST", `/api/v1/pam/web-app-sessions/${remote.sessionId}/end`);
    expect((await remote.state(1, "stopped")).statusCode).toBe(200);
    expect((await terminal(remote.sessionId, remote.uploadToken)).statusCode).toBe(200);
    expect((await seal(remote.sessionId, remote.uploadToken, data.ciphertextSha256)).statusCode).toBe(200);
    const deleted = await pamRequest(
      fixture.authToken,
      "DELETE",
      `/api/v1/pam/accounts/web-app/${disposable.accountId}`
    ).raw();
    expect(deleted.statusCode, deleted.payload).toBe(200);
    const playback = await pamRequest(
      fixture.authToken,
      "GET",
      `/api/v1/pam/sessions/${remote.sessionId}/playback`
    ).raw();
    expect(playback.statusCode, playback.payload).toBe(200);
    expect(playback.json().integrity.manifestSignatureVerified).toBe(true);
    expect(playback.json().storageBackend).toBe("postgres");
    expect(playback.json().chunks[0].ciphertextSha256).toBe(data.ciphertextSha256);
  });
  test("pages availability checks at 200 chunks with a two-connection pool", async () => {
    const remote = await worker();
    const body = Buffer.from("verified fixture");
    const digest = createHash("sha256").update(body).digest();
    await testDb(TableName.PamSessionEventChunk).insert(
      Array.from({ length: 201 }, (_, chunkIndex) => ({
        sessionId: remote.sessionId,
        chunkIndex,
        startElapsedMs: chunkIndex * 100,
        endElapsedMs: (chunkIndex + 1) * 100,
        storageBackend: "postgres",
        ciphertextSha256: digest,
        verifiedSha256: digest,
        verifiedAt: new Date(),
        ciphertextBytes: body.length,
        chunkSizeBytes: body.length,
        iv: randomBytes(12),
        encryptedEventsBlob: body
      }))
    );
    const first = await pamRequest(fixture.authToken, "GET", `/api/v1/pam/sessions/${remote.sessionId}/playback`).raw();
    expect(first.statusCode, first.payload).toBe(200);
    expect(first.json().availability).toMatchObject({ verifiedChunks: 200, checkedChunks: 200, verifyCursor: 200 });
    const next = await pamRequest(
      fixture.authToken,
      "GET",
      `/api/v1/pam/sessions/${remote.sessionId}/playback?verifyCursor=200`
    ).raw();
    expect(next.statusCode, next.payload).toBe(200);
    expect(next.json().availability).toMatchObject({ verifiedChunks: 1, checkedChunks: 1, verifyCursor: null });
  });
  test.each([null, "null", "object-version-1"])(
    "verifies S3 bytes with version %s and recovers a lost PUT receipt",
    async (versionId) => {
      const connectionId = await createAwsAppConnection({
        name: `pam-web-${randomUUID().slice(0, 8)}`,
        authToken: fixture.authToken
      });
      const bucket = `pam-web-${randomUUID().slice(0, 8)}`;
      fakeS3Bucket.failsAccessCheckWith("unwritable");
      const external = await createWebAppAccount(fixture, {
        recordingConnectionId: connectionId,
        settings: {
          recordingStorageBackend: "aws-s3",
          recordingS3Config: { bucket, region: "us-east-1", keyPrefix: "sessions" }
        }
      });
      fakeS3Bucket.failsAccessCheckWith(null);
      const remote = await worker(external.accountId);
      const data = chunk(remote.sessionId, remote.uploadToken);
      const key = `sessions/${fixture.projectId}/${remote.sessionId}/chunk-000000.json.enc`;
      const putBody = {
        chunkIndex: 0,
        ciphertextBytes: data.ciphertextBytes,
        ciphertextSha256Base64: data.ciphertextSha256
      };
      const mint = await testServer.inject({
        method: "POST",
        url: `/api/v1/pam/sessions/${remote.sessionId}/chunks/presigned-put`,
        headers: { authorization: `Bearer ${fixture.gatewayToken}`, "x-gateway-upload-token": remote.uploadToken },
        body: putBody
      });
      expect(mint.statusCode, mint.payload).toBe(200);
      expect(mint.json()).toMatchObject({
        alreadyUploaded: false,
        method: "PUT",
        headers: { "If-None-Match": "*", "x-amz-checksum-sha256": data.ciphertextSha256 }
      });
      fakeS3Bucket.putDirect(bucket, key, data.body, versionId);
      const recovered = await testServer.inject({
        method: "POST",
        url: `/api/v1/pam/sessions/${remote.sessionId}/chunks/presigned-put`,
        headers: { authorization: `Bearer ${fixture.gatewayToken}`, "x-gateway-upload-token": remote.uploadToken },
        body: putBody
      });
      expect(recovered.statusCode, recovered.payload).toBe(200);
      expect(recovered.json()).toEqual({
        alreadyUploaded: true,
        objectVersionId: versionId === "null" ? null : versionId
      });
      if (versionId === "object-version-1")
        expect((await upload(remote.sessionId, { ...data, ciphertext: undefined })).statusCode).toBe(400);
      expect(
        (
          await upload(remote.sessionId, {
            ...data,
            ciphertext: undefined,
            ...(versionId && versionId !== "null" ? { objectVersionId: versionId } : {})
          })
        ).statusCode
      ).toBe(200);
      const playback = await pamRequest(
        fixture.authToken,
        "GET",
        `/api/v1/pam/sessions/${remote.sessionId}/playback`
      ).raw();
      expect(playback.statusCode, playback.payload).toBe(200);
      expect(playback.json().availability.versionPinned).toBe(versionId === "object-version-1");
      const deniedDelete = await pamRequest(
        fixture.authToken,
        "DELETE",
        `/api/v1/app-connections/aws/${connectionId}`
      ).raw();
      expect(deniedDelete.statusCode).toBe(409);
      fakeS3Bucket.setObjectChecksum(bucket, key, Buffer.alloc(32).toString("base64"));
      const mismatched = await testServer.inject({
        method: "POST",
        url: `/api/v1/pam/sessions/${remote.sessionId}/chunks/presigned-put`,
        headers: { authorization: `Bearer ${fixture.gatewayToken}`, "x-gateway-upload-token": remote.uploadToken },
        body: putBody
      });
      expect(mismatched.statusCode).toBe(409);
      const wrongBytes = chunk(remote.sessionId, remote.uploadToken, 1);
      fakeS3Bucket.putDirect(
        bucket,
        `sessions/${fixture.projectId}/${remote.sessionId}/chunk-000001.json.enc`,
        Buffer.alloc(wrongBytes.ciphertextBytes),
        versionId
      );
      expect(
        (
          await upload(remote.sessionId, {
            ...wrongBytes,
            ciphertext: undefined,
            ...(versionId && versionId !== "null" ? { objectVersionId: versionId } : {})
          })
        ).statusCode
      ).toBe(400);
    }
  );
});
