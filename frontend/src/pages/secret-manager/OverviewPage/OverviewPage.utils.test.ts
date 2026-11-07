import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

const authToken = vi.hoisted(() => ({ value: "" }));

vi.mock("@app/hooks/api/reactQuery", () => ({ getAuthToken: () => authToken.value }));

const { getAuthSessionMarker, getSecretSortValue, overviewRowKey } = await import(
  "./OverviewPage.utils"
);

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const makeToken = (claims: Record<string, unknown>) =>
  `${encode({ alg: "none" })}.${encode(claims)}.signature`;

describe("Secrets overview helpers", () => {
  describe("overviewRowKey", () => {
    it("keeps rows of different types distinct even when their names would collide as strings", () => {
      assert.notEqual(overviewRowKey("proxied-service", "foo"), overviewRowKey("secret", "ps-foo"));
      assert.notEqual(overviewRowKey("secret", "a", "b"), overviewRowKey("secret", "a,b"));
      assert.notEqual(overviewRowKey("secret", '"x'), overviewRowKey("secret", "x"));
    });

    it("is stable for equal inputs and distinguishes numbers from strings", () => {
      assert.equal(overviewRowKey("folder", "a", 1), overviewRowKey("folder", "a", 1));
      assert.notEqual(overviewRowKey("folder", 1), overviewRowKey("folder", "1"));
    });
  });

  describe("getSecretSortValue", () => {
    it("joins the order field and direction", () => {
      assert.equal(
        getSecretSortValue(DashboardSecretsOrderBy.Name, OrderByDirection.ASC),
        `${DashboardSecretsOrderBy.Name}:${OrderByDirection.ASC}`
      );
    });
  });

  describe("getAuthSessionMarker", () => {
    beforeEach(() => {
      authToken.value = "";
    });

    it("is unchanged when the token is refreshed but the session claims stay the same", () => {
      const claims = {
        userId: "u1",
        tokenVersionId: "t1",
        accessVersion: 1,
        organizationId: "o1"
      };
      authToken.value = makeToken({ ...claims, iat: 1 });
      const first = getAuthSessionMarker();
      authToken.value = makeToken({ ...claims, iat: 2 });
      assert.equal(getAuthSessionMarker(), first);
    });

    it("changes when accessVersion or the organization changes", () => {
      const claims = { userId: "u1", tokenVersionId: "t1", accessVersion: 1, organizationId: "o1" };
      authToken.value = makeToken(claims);
      const original = getAuthSessionMarker();
      authToken.value = makeToken({ ...claims, accessVersion: 2 });
      assert.notEqual(getAuthSessionMarker(), original);
      authToken.value = makeToken({ ...claims, subOrganizationId: "o2" });
      assert.notEqual(getAuthSessionMarker(), original);
    });

    it("returns null when the token cannot be decoded", () => {
      authToken.value = "not-a-jwt";
      assert.equal(getAuthSessionMarker(), null);
    });
  });
});
