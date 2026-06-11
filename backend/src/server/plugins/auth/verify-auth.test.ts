import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { describe, expect, test, vi } from "vitest";

import { ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { AuthMode } from "@app/services/auth/auth-type";

import { verifyAuth } from "./verify-auth";

type FakeAuth = {
  authMode: AuthMode;
};

const makeReq = (auth: FakeAuth | undefined, opts?: { orgId?: string; method?: string }) =>
  ({
    auth,
    method: opts?.method ?? "GET",
    url: "/api/v1/secrets",
    permission: { orgId: opts?.orgId },
    shouldForwardWritesToPrimaryInstance: false
  }) as unknown as FastifyRequest;

const run = (
  strategies: AuthMode[],
  req: FastifyRequest,
  options?: { requireOrg: boolean }
): { done: HookHandlerDoneFunction; call: () => void } => {
  const done = vi.fn() as unknown as HookHandlerDoneFunction;
  const middleware = options ? verifyAuth(strategies, options) : verifyAuth(strategies);
  return { done, call: () => middleware(req, {} as FastifyReply, done) };
};

describe("verifyAuth — delegated OAuth access", () => {
  test("a JWT route accepts a first-party session JWT", () => {
    const { call, done } = run([AuthMode.JWT], makeReq({ authMode: AuthMode.JWT }, { orgId: "org-1" }));
    expect(call).not.toThrow();
    expect(done).toHaveBeenCalledOnce();
  });

  test("a JWT route does NOT accept a delegated OAuth token (must opt in explicitly)", () => {
    // This is the core of the explicit opt-in contract: a route guarded only by AuthMode.JWT — e.g.
    // account routes like /me/totp that authenticate on userId without building a scope-narrowed
    // permission — must reject delegated OAuth tokens so their scopes cannot be bypassed.
    const { call, done } = run([AuthMode.JWT], makeReq({ authMode: AuthMode.OAUTH }, { orgId: "org-1" }));
    expect(call).toThrow(ForbiddenRequestError);
    expect(done).not.toHaveBeenCalled();
  });

  test("an OAUTH-only route rejects a session JWT", () => {
    const { call, done } = run([AuthMode.OAUTH], makeReq({ authMode: AuthMode.JWT }, { orgId: "org-1" }));
    expect(call).toThrow(ForbiddenRequestError);
    expect(done).not.toHaveBeenCalled();
  });

  test("a route opts into delegated access by listing AuthMode.OAUTH alongside AuthMode.JWT", () => {
    const { call, done } = run(
      [AuthMode.JWT, AuthMode.OAUTH],
      makeReq({ authMode: AuthMode.OAUTH }, { orgId: "org-1" })
    );
    expect(call).not.toThrow();
    expect(done).toHaveBeenCalledOnce();
  });

  test("an OAUTH-only route accepts a delegated OAuth token", () => {
    const { call, done } = run([AuthMode.OAUTH], makeReq({ authMode: AuthMode.OAUTH }, { orgId: "org-1" }));
    expect(call).not.toThrow();
    expect(done).toHaveBeenCalledOnce();
  });

  test("a route that does not allow OAUTH (e.g. identity-only) rejects a delegated OAuth token", () => {
    const { call, done } = run(
      [AuthMode.IDENTITY_ACCESS_TOKEN],
      makeReq({ authMode: AuthMode.OAUTH }, { orgId: "org-1" })
    );
    expect(call).toThrow(ForbiddenRequestError);
    expect(done).not.toHaveBeenCalled();
  });

  test("OAuth tokens are excluded from a service-token route", () => {
    const { call } = run([AuthMode.SERVICE_TOKEN], makeReq({ authMode: AuthMode.OAUTH }, { orgId: "org-1" }));
    expect(call).toThrow(ForbiddenRequestError);
  });
});

describe("verifyAuth — requireOrg", () => {
  test("a delegated OAuth token without an org is rejected when requireOrg is set", () => {
    const { call } = run([AuthMode.JWT, AuthMode.OAUTH], makeReq({ authMode: AuthMode.OAUTH }), { requireOrg: true });
    expect(call).toThrow(UnauthorizedError);
  });

  test("a session JWT without an org is rejected when requireOrg is set", () => {
    const { call } = run([AuthMode.JWT], makeReq({ authMode: AuthMode.JWT }), { requireOrg: true });
    expect(call).toThrow(UnauthorizedError);
  });

  test("a delegated OAuth token with an org passes when requireOrg is set", () => {
    const { call, done } = run(
      [AuthMode.JWT, AuthMode.OAUTH],
      makeReq({ authMode: AuthMode.OAUTH }, { orgId: "org-1" }),
      {
        requireOrg: true
      }
    );
    expect(call).not.toThrow();
    expect(done).toHaveBeenCalledOnce();
  });

  test("requireOrg=false lets an org-less delegated OAuth token through", () => {
    const { call, done } = run([AuthMode.JWT, AuthMode.OAUTH], makeReq({ authMode: AuthMode.OAUTH }), {
      requireOrg: false
    });
    expect(call).not.toThrow();
    expect(done).toHaveBeenCalledOnce();
  });
});

describe("verifyAuth — guards", () => {
  test("throws when no auth is present on the request", () => {
    const { call } = run([AuthMode.JWT], makeReq(undefined));
    expect(call).toThrow(UnauthorizedError);
  });

  test("non-GET write requests forwarded to the primary instance short-circuit to done", () => {
    const done = vi.fn() as unknown as HookHandlerDoneFunction;
    const req = {
      method: "POST",
      shouldForwardWritesToPrimaryInstance: true
    } as unknown as FastifyRequest;
    verifyAuth([AuthMode.JWT])(req, {} as FastifyReply, done);
    expect(done).toHaveBeenCalledOnce();
  });
});
