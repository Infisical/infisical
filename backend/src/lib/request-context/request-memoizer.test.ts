import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionProjectType } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";

import { requestMemoKeys } from "./memo-keys";
import { RequestContextKey } from "./request-context-keys";
import { requestMemoize, RequestMemoizer } from "./request-memoizer";

// Mock @fastify/request-context — the module is resolved at import time,
// so vi.mock must be at the top level before any import that touches it.
const mockGet = vi.fn((key: string): RequestMemoizer | undefined => {
  void key;
  return undefined;
});
vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (key: string): RequestMemoizer | undefined => mockGet(key),
    set: vi.fn()
  }
}));

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// RequestMemoizer (pure class, no dependency on requestContext)
// ---------------------------------------------------------------------------
describe("RequestMemoizer", () => {
  let memoizer: RequestMemoizer;

  beforeEach(() => {
    memoizer = new RequestMemoizer();
  });

  describe("getOrSet", () => {
    it("should call the fetcher on first access and return its result", async () => {
      const fetcher = vi.fn().mockResolvedValue({ id: "proj-1", name: "Test Project" });

      const result = await memoizer.getOrSet("project:findById:proj-1", fetcher);

      expect(fetcher).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: "proj-1", name: "Test Project" });
    });

    it("should return the cached result on subsequent calls without re-executing the fetcher", async () => {
      const fetcher = vi.fn().mockResolvedValue({ id: "proj-1" });

      const first = await memoizer.getOrSet("project:findById:proj-1", fetcher);
      const second = await memoizer.getOrSet("project:findById:proj-1", fetcher);
      const third = await memoizer.getOrSet("project:findById:proj-1", fetcher);

      expect(fetcher).toHaveBeenCalledOnce();
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it("should cache null and undefined values", async () => {
      const nullFetcher = vi.fn().mockResolvedValue(null);
      const undefinedFetcher = vi.fn().mockResolvedValue(undefined);

      const r1 = await memoizer.getOrSet("key-null", nullFetcher);
      const r2 = await memoizer.getOrSet("key-null", nullFetcher);
      expect(r1).toBeNull();
      expect(r2).toBeNull();
      expect(nullFetcher).toHaveBeenCalledOnce();

      const r3 = await memoizer.getOrSet("key-undef", undefinedFetcher);
      const r4 = await memoizer.getOrSet("key-undef", undefinedFetcher);
      expect(r3).toBeUndefined();
      expect(r4).toBeUndefined();
      expect(undefinedFetcher).toHaveBeenCalledOnce();
    });

    it("should keep entries for different keys independent", async () => {
      const fetcherA = vi.fn().mockResolvedValue("A");
      const fetcherB = vi.fn().mockResolvedValue("B");

      const a = await memoizer.getOrSet("key-a", fetcherA);
      const b = await memoizer.getOrSet("key-b", fetcherB);

      expect(a).toBe("A");
      expect(b).toBe("B");
      expect(fetcherA).toHaveBeenCalledOnce();
      expect(fetcherB).toHaveBeenCalledOnce();

      const spyA = vi.fn().mockResolvedValue("should-not-run");
      const spyB = vi.fn().mockResolvedValue("should-not-run");
      expect(await memoizer.getOrSet("key-a", spyA)).toBe("A");
      expect(await memoizer.getOrSet("key-b", spyB)).toBe("B");
      expect(spyA).not.toHaveBeenCalled();
      expect(spyB).not.toHaveBeenCalled();
    });

    it("should not cache the result when the fetcher throws", async () => {
      const fetcher = vi.fn().mockRejectedValueOnce(new Error("db-down")).mockResolvedValueOnce("recovered");

      await expect(memoizer.getOrSet("flaky", fetcher)).rejects.toThrow("db-down");
      const result = await memoizer.getOrSet("flaky", fetcher);

      expect(result).toBe("recovered");
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// requestMemoize (integration with @fastify/request-context)
// ---------------------------------------------------------------------------
describe("requestMemoize", () => {
  it("should use the memoizer from request context when available", async () => {
    const memoizer = new RequestMemoizer();
    mockGet.mockReturnValue(memoizer);

    const fetcher = vi.fn().mockResolvedValue("cached-value");

    const r1 = await requestMemoize("key", fetcher);
    const r2 = await requestMemoize("key", fetcher);

    expect(r1).toBe("cached-value");
    expect(r2).toBe("cached-value");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mockGet).toHaveBeenCalledWith(RequestContextKey.Memoizer);
  });

  it("should fall back to direct execution when no memoizer in context", async () => {
    mockGet.mockReturnValue(undefined);

    const fetcher = vi.fn().mockResolvedValue("direct");

    const r1 = await requestMemoize("key", fetcher);
    const r2 = await requestMemoize("key", fetcher);

    expect(r1).toBe("direct");
    expect(r2).toBe("direct");
    // Called twice because there's no memoizer to cache the result
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Simulated integration: DAL deduplication pattern
// ---------------------------------------------------------------------------
describe("request-scoped DAL deduplication", () => {
  it("should deduplicate projectDAL.findById calls across services within a request", async () => {
    const memoizer = new RequestMemoizer();
    type SimulatedProject = { id: string; name: string; orgId: string };
    const mockFindById = vi.fn(async (id: string): Promise<SimulatedProject> => {
      void id;
      return { id: "proj-1", name: "My Project", orgId: "org-1" };
    });

    // Simulate the permission service calling findById
    const fromPermission = await memoizer.getOrSet("project:findById:proj-1", () => mockFindById("proj-1"));

    // Simulate getBotKey calling findById for the same project
    const fromBot = await memoizer.getOrSet("project:findById:proj-1", () => mockFindById("proj-1"));

    // Simulate a different projectId (should hit DB)
    const fromOther = await memoizer.getOrSet("project:findById:proj-2", () => mockFindById("proj-2"));

    expect(mockFindById).toHaveBeenCalledTimes(2); // proj-1 once, proj-2 once
    expect(fromPermission).toBe(fromBot); // same reference
    expect(fromOther).toEqual({ id: "proj-1", name: "My Project", orgId: "org-1" }); // different call
  });

  it("should deduplicate getProjectPermission calls for batch operations", async () => {
    const memoizer = new RequestMemoizer();

    const mockPermissionResult = {
      permission: { can: vi.fn() },
      memberships: [{ roles: [] }],
      hasRole: vi.fn()
    };

    const permissionFetcher = vi.fn().mockResolvedValue(mockPermissionResult);

    // Simulate 50 secret operations each checking the same project permission
    const cacheKey = requestMemoKeys.projectPermission({
      projectId: "proj-1",
      actor: ActorType.IDENTITY,
      actorId: "id-1",
      actorAuthMethod: null,
      actionProjectType: ActionProjectType.SecretManager,
      actorOrgId: "org-1"
    });
    const results = await Promise.all(Array.from({ length: 50 }, () => memoizer.getOrSet(cacheKey, permissionFetcher)));

    expect(permissionFetcher).toHaveBeenCalledOnce();
    // All 50 results should be the same reference
    expect(results.every((r) => r === mockPermissionResult)).toBe(true);
  });

  it("should isolate caches between different memoizer instances (different requests)", async () => {
    const request1Memoizer = new RequestMemoizer();
    const request2Memoizer = new RequestMemoizer();

    const fetcher1 = vi.fn().mockResolvedValue("request-1-data");
    const fetcher2 = vi.fn().mockResolvedValue("request-2-data");

    const r1 = await request1Memoizer.getOrSet(requestMemoKeys.projectFindById("proj-1"), fetcher1);
    const r2 = await request2Memoizer.getOrSet(requestMemoKeys.projectFindById("proj-1"), fetcher2);

    expect(r1).toBe("request-1-data");
    expect(r2).toBe("request-2-data");
    expect(fetcher1).toHaveBeenCalledOnce();
    expect(fetcher2).toHaveBeenCalledOnce();
  });
});
