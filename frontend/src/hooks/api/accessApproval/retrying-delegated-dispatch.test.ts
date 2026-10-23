import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

import { DelegatedApprovalRequestStatus } from "../delegatedApprovals/enums";
import {
  isDelegatedDispatchRetrying,
  markDelegatedDispatchRetry,
  noteDelegatedDispatchRetryStatuses
} from "./retrying-delegated-dispatch";

const markedIds = new Set<string>();

const mark = (id: string) => {
  markedIds.add(id);
  markDelegatedDispatchRetry(id);
};

const note = (id: string, status: DelegatedApprovalRequestStatus | null) =>
  noteDelegatedDispatchRetryStatuses([{ id, status }]);

describe("delegated dispatch retry store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    noteDelegatedDispatchRetryStatuses([...markedIds].map((id) => ({ id, status: null })));
    markedIds.clear();
    vi.useRealTimers();
  });

  it("keeps the retry while the outbox has not picked up the resend", () => {
    mark("before-pickup");
    vi.advanceTimersByTime(10_000);
    note("before-pickup", DelegatedApprovalRequestStatus.FailedDispatch);

    assert.equal(isDelegatedDispatchRetrying("before-pickup"), true);
  });

  it("clears the retry when the resend failed between two polls", () => {
    mark("missed-pending");
    note("missed-pending", DelegatedApprovalRequestStatus.FailedDispatch);
    vi.advanceTimersByTime(30_000);
    note("missed-pending", DelegatedApprovalRequestStatus.FailedDispatch);

    assert.equal(isDelegatedDispatchRetrying("missed-pending"), false);
  });

  it("clears the retry once a dispatch it saw start has failed", () => {
    mark("seen-pending");
    note("seen-pending", DelegatedApprovalRequestStatus.PendingDispatch);
    note("seen-pending", DelegatedApprovalRequestStatus.FailedDispatch);

    assert.equal(isDelegatedDispatchRetrying("seen-pending"), false);
  });

  it("keeps the retry while the dispatch is running past the pickup window", () => {
    mark("long-dispatch");
    note("long-dispatch", DelegatedApprovalRequestStatus.PendingDispatch);
    vi.advanceTimersByTime(60_000);
    note("long-dispatch", DelegatedApprovalRequestStatus.PendingDispatch);

    assert.equal(isDelegatedDispatchRetrying("long-dispatch"), true);
  });

  it("clears the retry as soon as the request reaches the delegated system", () => {
    mark("delivered");
    note("delivered", DelegatedApprovalRequestStatus.WaitingApproval);

    assert.equal(isDelegatedDispatchRetrying("delivered"), false);
  });

  it("keeps a retry another list does not include until it expires", () => {
    mark("other-env");
    vi.advanceTimersByTime(10_000);
    note("unrelated", DelegatedApprovalRequestStatus.WaitingApproval);

    assert.equal(isDelegatedDispatchRetrying("other-env"), true);
  });

  it("drops a retry whose request never shows up again", () => {
    mark("left-the-list");
    vi.advanceTimersByTime(120_000);
    note("unrelated", DelegatedApprovalRequestStatus.WaitingApproval);

    assert.equal(isDelegatedDispatchRetrying("left-the-list"), false);
  });
});
