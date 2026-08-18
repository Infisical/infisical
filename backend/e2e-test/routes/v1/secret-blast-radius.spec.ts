import { seedData1 } from "@app/db/seed-data";
import { ExposureBand, RotationVerdict } from "@app/ee/services/secret-blast-radius/secret-blast-radius-types";

import { createSecretV2, deleteSecretV2 } from "../../testUtils/secrets";

describe("Secret Blast Radius V1 Router", async () => {
  const secretKey = "BLAST_RADIUS_E2E";
  const baseQuery = {
    projectId: seedData1.projectV3.id,
    environment: seedData1.environment.slug,
    secretPath: "/"
  };

  const buildUrl = (path: string, query: Record<string, string> = {}) =>
    `${path}?${new URLSearchParams({ ...baseQuery, ...query }).toString()}`;

  beforeAll(async () => {
    await createSecretV2({
      workspaceId: seedData1.projectV3.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      key: secretKey,
      value: "blast-radius-e2e-value",
      authToken: jwtAuthToken
    });
  });

  // Specs share one seeded project, so anything created here has to leave with it.
  afterAll(async () => {
    await deleteSecretV2({
      workspaceId: seedData1.projectV3.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      key: secretKey,
      authToken: jwtAuthToken
    });
  });

  describe("GET /api/v1/secrets/:secretName/blast-radius", () => {
    test("requires authentication", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`)
      });

      expect(res.statusCode).toBe(401);
    });

    test("returns every leg of the graph for a real secret", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(200);
      const { blastRadius } = JSON.parse(res.payload);

      expect(blastRadius.secret).toEqual(
        expect.objectContaining({
          key: secretKey,
          environment: seedData1.environment.slug,
          secretPath: "/",
          isRotationManaged: false
        })
      );
      expect(Object.values(ExposureBand)).toContain(blastRadius.exposure.band);
      expect(Array.isArray(blastRadius.exposure.drivers)).toBe(true);

      // The seeded admin can read the secret, so the entitlement leg must not come back empty.
      expect(blastRadius.principals.length).toBeGreaterThan(0);
      expect(blastRadius.principals[0]).toEqual(
        expect.objectContaining({
          actions: expect.arrayContaining(["readValue"]),
          grantPaths: expect.any(Array)
        })
      );

      // Counts stay complete even when the canvas is not: drawn never exceeds total.
      expect(blastRadius.truncated.principals.total).toBeGreaterThanOrEqual(
        blastRadius.truncated.principals.drawn
      );
      expect(blastRadius.window.effectiveDays).toBe(30);
    });

    test("resolves at least one grant path with a reason", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      const { blastRadius } = JSON.parse(res.payload);
      const withPath = blastRadius.principals.find(
        (principal: { grantPaths: unknown[] }) => principal.grantPaths.length > 0
      );

      expect(withPath).toBeDefined();
      expect(withPath.grantPaths[0].via.length).toBeGreaterThan(0);
      expect(["role", "groupRole", "additionalPrivilege"]).toContain(
        withPath.grantPaths[0].via[0].kind === "group" ? "groupRole" : withPath.grantPaths[0].via[0].kind
      );
    });

    test("never returns the secret value", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.payload).not.toContain("blast-radius-e2e-value");
    });

    test("filters apply to the whole set before the page is cut", async () => {
      const [unfiltered, describeOnly] = await Promise.all([
        testServer.inject({
          method: "GET",
          url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`),
          headers: { authorization: `Bearer ${jwtAuthToken}` }
        }),
        testServer.inject({
          method: "GET",
          url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`, {
            principalAccess: "describe-only"
          }),
          headers: { authorization: `Bearer ${jwtAuthToken}` }
        })
      ]);

      const all = JSON.parse(unfiltered.payload).blastRadius;
      const filtered = JSON.parse(describeOnly.payload).blastRadius;

      expect(filtered.truncated.principals.total).toBeLessThanOrEqual(
        all.truncated.principals.total
      );
      // The score describes the secret, not the current view, so filtering must not move it.
      expect(filtered.exposure.score).toBe(all.exposure.score);
    });

    test("404s for a secret that does not exist", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl("/api/v1/secrets/NOT_A_REAL_SECRET/blast-radius"),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(404);
    });

    test("rejects an unknown activity window", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`, { window: "3000d" }),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(422);
    });

    test("rejects a principal page size above the cap", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`, { principalLimit: "5000" }),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(422);
    });

    test("rejects an unknown principal filter", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/blast-radius`, {
          principalAccess: "everything"
        }),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe("GET /api/v1/secrets/:secretName/rotation-simulation", () => {
    test("returns a verdict and all four lists", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/rotation-simulation`),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(200);
      const { simulation } = JSON.parse(res.payload);

      expect(Object.values(RotationVerdict)).toContain(simulation.verdict);
      expect(simulation.headline).toMatch(/rotate/i);
      expect(simulation.reasonsToRotate).toBeInstanceOf(Array);
      expect(simulation.impacts).toBeInstanceOf(Array);
      expect(simulation.worthKnowing).toBeInstanceOf(Array);
      expect(simulation.willUpdateAutomatically).toBeInstanceOf(Array);
    });

    test("a fresh secret with no destinations is safe to rotate", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: buildUrl(`/api/v1/secrets/${secretKey}/rotation-simulation`),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      const { simulation } = JSON.parse(res.payload);
      expect(simulation.impacts).toEqual([]);
      expect(simulation.verdict).not.toBe(RotationVerdict.Red);
    });

    test("is a GET, so it cannot be invoked as a mutation", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: buildUrl(`/api/v1/secrets/${secretKey}/rotation-simulation`),
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/insights/secrets/exposure-ranking", () => {
    test("requires authentication", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/insights/secrets/exposure-ranking?projectId=${seedData1.projectV3.id}`
      });

      expect(res.statusCode).toBe(401);
    });

    test("ranks secrets with a score and a driver", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/insights/secrets/exposure-ranking?projectId=${seedData1.projectV3.id}&limit=5`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(200);
      const { rankings } = JSON.parse(res.payload);
      expect(rankings).toBeInstanceOf(Array);
      expect(rankings.length).toBeLessThanOrEqual(5);

      if (rankings.length) {
        expect(rankings[0]).toEqual(
          expect.objectContaining({
            secretKey: expect.any(String),
            environment: expect.any(String),
            entitledCount: expect.any(Number),
            destinationCount: expect.any(Number)
          })
        );
        // Ranked most exposed first.
        const scores = rankings.map((entry: { score: number | null }) => entry.score ?? 0);
        expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
      }
    });

    test("caps the requested limit", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/insights/secrets/exposure-ranking?projectId=${seedData1.projectV3.id}&limit=500`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(422);
    });
  });
});
