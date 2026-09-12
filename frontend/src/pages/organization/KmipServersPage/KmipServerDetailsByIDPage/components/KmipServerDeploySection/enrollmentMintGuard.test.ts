import { QueryClient } from "@tanstack/react-query";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createKmipEnrollmentMintCommit } from "./enrollmentMintGuard";

const queryKey = [{ kmipServerId: "server-id" }, "kmip-server-enrollment"] as const;
const firstEnrollment = { token: "first-token", expiresAt: "2026-09-10T12:00:00.000Z" };
const secondEnrollment = { token: "second-token", expiresAt: "2026-09-10T13:00:00.000Z" };

describe("KMIP enrollment mint lifecycle guard", () => {
  it("commits an initial enrollment when its lifecycle and cache remain current", () => {
    const queryClient = new QueryClient();
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    assert.equal(commitMint(firstEnrollment, 1), true);
    assert.deepEqual(queryClient.getQueryData(queryKey), firstEnrollment);
  });

  it("preserves valid regeneration when the existing enrollment remains current", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, firstEnrollment);
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    assert.equal(commitMint(secondEnrollment, 1), true);
    assert.deepEqual(queryClient.getQueryData(queryKey), secondEnrollment);
  });

  it("rejects a delayed enrollment after the cache is cleared from null to null", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, null);
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    queryClient.setQueryData(queryKey, null);

    assert.equal(commitMint(firstEnrollment, 1), false);
    assert.equal(queryClient.getQueryData(queryKey), null);
  });

  it("rejects a delayed enrollment after an existing enrollment is cleared", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, firstEnrollment);
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    queryClient.setQueryData(queryKey, null);

    assert.equal(commitMint(secondEnrollment, 1), false);
    assert.equal(queryClient.getQueryData(queryKey), null);
  });

  it("rejects a delayed initial enrollment after the empty cache is cleared", () => {
    const queryClient = new QueryClient();
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    queryClient.setQueryData(queryKey, null);

    assert.equal(commitMint(firstEnrollment, 1), false);
    assert.equal(queryClient.getQueryData(queryKey), null);
  });

  it("rejects a delayed enrollment after the auth method changes away and back", () => {
    const queryClient = new QueryClient();
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    assert.equal(commitMint(firstEnrollment, 3), false);
    assert.equal(queryClient.getQueryData(queryKey), undefined);
  });

  it("rejects a delayed enrollment after navigation or unmount advances the lifecycle", () => {
    const queryClient = new QueryClient();
    const commitMint = createKmipEnrollmentMintCommit(queryClient, queryKey, 1);

    assert.equal(commitMint(firstEnrollment, 2), false);
    assert.equal(queryClient.getQueryData(queryKey), undefined);
  });
});
