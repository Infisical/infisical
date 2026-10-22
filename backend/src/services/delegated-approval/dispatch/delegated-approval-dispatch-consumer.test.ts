import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TEventOutbox } from "@app/db/schemas";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { eventOutboxRegistryFactory } from "@app/services/event-outbox/event-outbox-registry";
import { eventOutboxServiceFactory } from "@app/services/event-outbox/event-outbox-service";
import { EventOutboxStatus, EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "../delegated-approval-enums";
import { DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT } from "../delegated-approval-events";
import { TDelegatedApprovalRequestDetails } from "../delegated-approval-schemas";
import { delegatedApprovalDispatchConsumerFactory } from "./delegated-approval-dispatch-consumer";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

vi.mock("@app/lib/telemetry/metrics", () => ({
  recordEventOutboxLagMetric: () => {},
  recordEventOutboxExhaustedMetric: () => {}
}));

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("./delegated-approval-dispatch-fns", () => ({
  getDelegatedApprovalProvider: () => ({ dispatch }),
  getDelegatedApprovalDispatchDetailsBuilder: () => () => ({
    policyType: "secret-access",
    environment: "dev",
    secretPath: "/",
    permissions: ["read"],
    isTemporary: false,
    temporaryRange: null
  })
}));

vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: async (connection: unknown) => connection
}));

const DELEGATED_REQUEST_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const RETRY_REASON =
  "ServiceNow did not respond. Infisical will retry automatically. If it keeps failing, send the request again.";
const SERVICENOW_RECORD = { type: DelegatedApprovalPolicyType.ServiceNow, recordNumber: "INFAR1000000" };

const pendingDelegatedRequest = {
  id: DELEGATED_REQUEST_ID,
  requestId: "req-1",
  status: DelegatedApprovalRequestStatus.PendingDispatch,
  details: {} as TDelegatedApprovalRequestDetails,
  providerRequestId: null as string | null,
  encryptedCallbackToken: null
};

type TRow = typeof pendingDelegatedRequest;

const approvalRequest = {
  id: "req-1",
  policyId: "policy-1",
  projectId: "project-1",
  organizationId: ORG_ID,
  type: ApprovalPolicyType.SecretAccess,
  status: ApprovalRequestStatus.Pending,
  requesterName: "Ada",
  requesterEmail: "ada@example.com",
  justification: null
};

const delegatedPolicy = {
  id: "delegated-policy-1",
  policyId: "policy-1",
  type: DelegatedApprovalPolicyType.ServiceNow,
  connectionId: "connection-1"
};

const PRIMARY = { primary: true } as never;

const buildConsumer = ({
  delegatedRequest = pendingDelegatedRequest as TRow | null,
  approval = approvalRequest as unknown,
  policy = delegatedPolicy as unknown,
  findById = undefined as ((id: string) => Promise<TRow | null>) | undefined
} = {}) => {
  let row: TRow | null = delegatedRequest ? { ...delegatedRequest } : null;

  // Merges details the way the DAL's jsonb concatenation does.
  const updateWithDetails = vi.fn(
    async (filter: Partial<TRow>, { details, ...columns }: Partial<TRow> & { details?: Partial<TRow["details"]> }) => {
      const current = row;
      if (!current) return [];
      const matches = Object.entries(filter).every(([key, value]) => current[key as keyof TRow] === value);
      if (!matches) return [];
      row = { ...current, ...columns, details: { ...current.details, ...details } };
      return [row];
    }
  );

  const consumer = delegatedApprovalDispatchConsumerFactory({
    delegatedApprovalRequestDAL: {
      findById: findById ?? vi.fn(async () => row),
      primaryNode: () => PRIMARY,
      updateWithDetails
    },
    delegatedApprovalPolicyDAL: { findOne: vi.fn().mockResolvedValue(policy) },
    delegatedApprovalCallbackService: {
      getCallbackUrl: () => "https://infisical.example.com/api/v1/delegated-approvals/callback",
      getOrIssueCallbackToken: vi.fn().mockResolvedValue("callback-token")
    },
    approvalRequestDAL: { findById: vi.fn().mockResolvedValue(approval) },
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", name: "Project", type: "secret-manager" }) },
    appConnectionDAL: {
      findById: vi.fn().mockResolvedValue({ id: "connection-1", orgId: ORG_ID, app: "servicenow" })
    },
    kmsService: { createCipherPairWithDataKey: vi.fn() }
  } as never);

  return { consumer, row: () => row, updateWithDetails };
};

const makeEvent = (overrides?: Partial<TEvent>): TEvent => ({
  id: 1,
  eventType: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
  payload: { delegatedRequestId: DELEGATED_REQUEST_ID },
  occurredAt: new Date(),
  ...overrides
});

beforeEach(() => {
  dispatch.mockReset();
});

describe("delegatedApprovalDispatchConsumer", () => {
  test("delivers the request and records the provider's record id and number", async () => {
    dispatch.mockResolvedValueOnce({ providerRequestId: "snow-1", providerDetails: SERVICENOW_RECORD });
    const { consumer, row } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      delegatedRequestId: DELEGATED_REQUEST_ID,
      approvalRequestId: "req-1",
      callback: { token: "callback-token" }
    });
    expect(row()).toEqual({
      ...pendingDelegatedRequest,
      status: DelegatedApprovalRequestStatus.WaitingApproval,
      providerRequestId: "snow-1",
      details: { statusReason: null, provider: SERVICENOW_RECORD }
    });
  });

  test("delivers a request whose provider reported no record number", async () => {
    dispatch.mockResolvedValueOnce({ providerRequestId: "snow-1" });
    const { consumer, row } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(row()).toEqual({
      ...pendingDelegatedRequest,
      status: DelegatedApprovalRequestStatus.WaitingApproval,
      providerRequestId: "snow-1",
      details: { statusReason: null }
    });
  });

  test("asks the outbox to retry a transient provider failure and tells the user it will", async () => {
    dispatch.mockRejectedValueOnce(new Error("ServiceNow did not respond."));
    const { consumer, row } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Retry, error: "ServiceNow did not respond." }]);
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.FailedDispatch,
      details: { statusReason: RETRY_REASON }
    });
  });

  test("fails terminally on an unrecoverable error without promising a retry", async () => {
    dispatch.mockRejectedValueOnce(new UnrecoverableError("ServiceNow rejected the credentials."));
    const { consumer, row } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([
      { id: "1", status: EventResultStatus.Failed, error: "ServiceNow rejected the credentials." }
    ]);
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.FailedDispatch,
      details: { statusReason: "ServiceNow rejected the credentials." }
    });
  });

  test("fails terminally when the approval request is no longer pending", async () => {
    const { consumer, row } = buildConsumer({
      approval: { ...approvalRequest, status: ApprovalRequestStatus.Cancelled }
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(dispatch).not.toHaveBeenCalled();
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.FailedDispatch);
  });

  test("fails terminally when the approval request expired before it was sent", async () => {
    const { consumer, row } = buildConsumer({
      approval: { ...approvalRequest, expiresAt: new Date(Date.now() - 60_000) }
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(dispatch).not.toHaveBeenCalled();
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.FailedDispatch);
    expect(row()?.details.statusReason).toContain("expired");
  });

  test.each([
    ["is gone", null],
    ["is no longer awaiting dispatch", { ...pendingDelegatedRequest, status: DelegatedApprovalRequestStatus.Approved }],
    ["was already delivered", { ...pendingDelegatedRequest, providerRequestId: "snow-1" }]
  ])("marks the event delivered without calling the provider when the request %s", async (_, delegatedRequest) => {
    const { consumer } = buildConsumer({ delegatedRequest });

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("fails an unreadable payload terminally", async () => {
    const { consumer } = buildConsumer();

    const [result] = await consumer.handle([makeEvent({ payload: { delegatedRequestId: "not-a-uuid" } })]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("Unreadable delegated approval dispatch payload");
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// Why this consumer exists: a dispatch that fails is kept by the outbox and tried again, instead of
// depending on an enqueue that ran after the request committed and could be lost with it.
describe("delegatedApprovalDispatchConsumer through the outbox", () => {
  const buildOutbox = (consumer: ReturnType<typeof buildConsumer>["consumer"]) => {
    const registry = eventOutboxRegistryFactory();
    registry.register(consumer);

    const rows: TEventOutbox[] = [];
    const isDue = (row: TEventOutbox) =>
      (row.status === EventOutboxStatus.Pending || row.status === EventOutboxStatus.Retry) &&
      row.nextRetryAt <= new Date();

    const service = eventOutboxServiceFactory({
      eventOutboxDAL: {
        insertEvents: async (inserted: Pick<TEventOutbox, "consumer" | "eventType" | "payload">[]) => {
          inserted.forEach((row) =>
            rows.push({
              id: rows.length + 1,
              status: EventOutboxStatus.Pending,
              attempts: 0,
              nextRetryAt: new Date(0),
              occurredAt: new Date(),
              ...row
            } as TEventOutbox)
          );
        },
        claimBatch: async () => {
          const claimable = rows.filter(isDue);
          claimable.forEach((row) => Object.assign(row, { status: EventOutboxStatus.Processing }));
          return { lockToken: "token", rows: claimable.map((row) => ({ ...row })) };
        },
        extendClaims: async () => {},
        commitResults: async (input: {
          delivered: { ids: string[] }[];
          retriable: { ids: string[]; nextRetryDelayMs: number; error?: string }[];
          failed: { ids: string[]; error?: string }[];
        }) => {
          const apply = (
            groups: { ids: string[]; nextRetryDelayMs?: number; error?: string }[],
            status: EventOutboxStatus
          ) =>
            groups.forEach((group) =>
              group.ids.forEach((id) => {
                const row = rows.find((candidate) => String(candidate.id) === id);
                if (!row) return;
                row.status = status;
                row.attempts += 1;
                row.lastError = group.error ?? null;
                row.nextRetryAt = new Date(Date.now() + (group.nextRetryDelayMs ?? 0));
              })
            );
          apply(input.delivered, EventOutboxStatus.Delivered);
          apply(input.retriable, EventOutboxStatus.Retry);
          apply(input.failed, EventOutboxStatus.Failed);
          return [...input.delivered, ...input.retriable, ...input.failed].reduce(
            (n, group) => n + group.ids.length,
            0
          );
        }
      } as never,
      eventOutboxRegistry: registry
    });

    const elapseBackoff = () => {
      rows.forEach((row) => Object.assign(row, { nextRetryAt: new Date(0) }));
    };

    return { service, rows, elapseBackoff };
  };

  test("retries a dispatch the provider refused and delivers it on a later flush", async () => {
    dispatch
      .mockRejectedValueOnce(new Error("ServiceNow did not respond."))
      .mockResolvedValueOnce({ providerRequestId: "snow-1" });
    const { consumer, row } = buildConsumer();
    const { service, rows, elapseBackoff } = buildOutbox(consumer);

    await service.emit(
      { eventType: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT, payload: { delegatedRequestId: DELEGATED_REQUEST_ID } },
      PRIMARY
    );
    expect(rows).toHaveLength(1);

    await service.drain({ consumer: consumer.name });

    expect(rows[0]).toMatchObject({
      status: EventOutboxStatus.Retry,
      attempts: 1,
      lastError: "ServiceNow did not respond."
    });
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.FailedDispatch,
      details: { statusReason: RETRY_REASON }
    });

    await service.drain({ consumer: consumer.name });
    expect(rows[0].status).toBe(EventOutboxStatus.Retry);
    expect(dispatch).toHaveBeenCalledTimes(1);

    elapseBackoff();
    await service.drain({ consumer: consumer.name });

    expect(rows[0]).toMatchObject({ status: EventOutboxStatus.Delivered, attempts: 2 });
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.WaitingApproval,
      providerRequestId: "snow-1",
      details: { statusReason: null }
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
