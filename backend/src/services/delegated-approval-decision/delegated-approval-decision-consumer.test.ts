import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TEventOutbox } from "@app/db/schemas";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import {
  DelegatedApprovalPolicyType,
  DelegatedApprovalRequestStatus
} from "@app/services/delegated-approval/delegated-approval-enums";
import { TDelegatedApprovalRequestDetails } from "@app/services/delegated-approval/delegated-approval-schemas";
import { DelegatedApprovalCallbackEvent } from "@app/services/delegated-approval-callback/delegated-approval-callback-enums";
import { eventOutboxRegistryFactory } from "@app/services/event-outbox/event-outbox-registry";
import { eventOutboxServiceFactory } from "@app/services/event-outbox/event-outbox-service";
import { EventOutboxStatus, EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";

import { DELEGATED_APPROVAL_DECISION_RETRY_HINT } from "./delegated-approval-decision-constants";
import { delegatedApprovalDecisionConsumerFactory } from "./delegated-approval-decision-consumer";
import { DelegatedApprovalDecision, DelegatedApprovalDecisionOutcome } from "./delegated-approval-decision-enums";
import { delegatedApprovalDecisionServiceFactory } from "./delegated-approval-decision-service";
import { TDelegatedApprovalDecisionReadResult } from "./delegated-approval-decision-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

vi.mock("@app/lib/telemetry/metrics", () => ({
  recordEventOutboxLagMetric: () => {},
  recordEventOutboxExhaustedMetric: () => {}
}));

const { fetchDecision, REQUESTED_PERMISSIONS } = vi.hoisted(() => ({
  fetchDecision: vi.fn(),
  REQUESTED_PERMISSIONS: ["secrets:        read, create", "secret-folders: edit"]
}));
vi.mock("@app/services/delegated-approval/dispatch/delegated-approval-dispatch-fns", () => ({
  getDelegatedApprovalProvider: () => ({ fetchDecision }),
  getDelegatedApprovalDispatchDetailsBuilder: () => () => ({
    policyType: "secret-access",
    environment: "dev",
    secretPath: "/",
    permissions: REQUESTED_PERMISSIONS,
    isTemporary: false,
    temporaryRange: null
  })
}));

vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: async (connection: unknown) => connection
}));

const DELEGATED_REQUEST_ID = "11111111-1111-1111-1111-111111111111";
const APPROVAL_REQUEST_ID = "33333333-3333-3333-3333-333333333333";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const EXTERNAL_ID = "snow-1";
const POLICY_NAME = "Production secrets";
const TX = { tx: true } as never;
const PRIMARY = { primary: true } as never;
const SERVICENOW_RECORD = { type: DelegatedApprovalPolicyType.ServiceNow, recordNumber: "INFAR1000000" };
const waitingDelegatedRequest = {
  id: DELEGATED_REQUEST_ID,
  requestId: APPROVAL_REQUEST_ID,
  status: DelegatedApprovalRequestStatus.WaitingApproval,
  details: { statusReason: null, provider: SERVICENOW_RECORD } as TDelegatedApprovalRequestDetails,
  providerRequestId: EXTERNAL_ID as string | null
};

type TDelegatedRow = typeof waitingDelegatedRequest;

const pendingApprovalRequest = {
  id: APPROVAL_REQUEST_ID,
  policyId: "policy-1",
  projectId: "project-1",
  organizationId: ORG_ID,
  requesterId: "user-1" as string | null,
  type: ApprovalPolicyType.SecretAccess,
  status: ApprovalRequestStatus.Pending as string,
  expiresAt: null as Date | null
};

type TApprovalRow = typeof pendingApprovalRequest;

const delegatedPolicy = {
  id: "delegated-policy-1",
  policyId: "policy-1",
  type: DelegatedApprovalPolicyType.ServiceNow,
  connectionId: "connection-1"
};

const decided = (
  decision: DelegatedApprovalDecision,
  overrides: Partial<Extract<TDelegatedApprovalDecisionReadResult, { status: "decided" }>> = {}
): TDelegatedApprovalDecisionReadResult => ({
  status: "decided",
  decision,
  approvalRequestId: APPROVAL_REQUEST_ID,
  permissions: ["secrets:        create, read", "secret-folders: edit"],
  decidedBy: "Grace Hopper",
  decidedAt: "2026-10-20 10:15:00",
  notes: null,
  ...overrides
});

const buildConsumer = ({
  delegatedRequest = waitingDelegatedRequest as TDelegatedRow | null,
  approvalRequest = pendingApprovalRequest as TApprovalRow | null,
  policy = delegatedPolicy as typeof delegatedPolicy | null,
  connection = { id: "connection-1", orgId: ORG_ID, app: "servicenow" } as { id: string; orgId: string } | null,
  isRequesterProjectMember = true
} = {}) => {
  let row: TDelegatedRow | null = delegatedRequest ? { ...delegatedRequest } : null;
  let approval: TApprovalRow | null = approvalRequest ? { ...approvalRequest } : null;

  // Merges details the way the DAL's jsonb concatenation does.
  const updateWithDetails = vi.fn(
    async (
      filter: Partial<TDelegatedRow>,
      { details, ...columns }: Partial<TDelegatedRow> & { details?: Partial<TDelegatedRow["details"]> }
    ) => {
      const current = row;
      if (!current) return [];
      const matches = Object.entries(filter).every(([key, value]) => current[key as keyof TDelegatedRow] === value);
      if (!matches) return [];
      row = { ...current, ...columns, details: { ...current.details, ...details } };
      return [row];
    }
  );

  const updateById = vi.fn(async (_id: string, patch: Partial<TApprovalRow>) => {
    approval = approval ? { ...approval, ...patch } : approval;
    return approval;
  });
  const postApprovalTxRoutine = vi.fn(async () => ({ grantId: "grant-1" }));
  const createAuditLog = vi.fn(async () => {});
  const notify = vi.fn(async () => {});

  const delegatedApprovalDecisionService = delegatedApprovalDecisionServiceFactory({
    delegatedApprovalRequestDAL: {
      findById: vi.fn(async () => row),
      primaryNode: () => PRIMARY,
      updateWithDetails
    },
    delegatedApprovalPolicyDAL: { findOne: vi.fn().mockResolvedValue(policy) },
    approvalPolicyDAL: { findById: vi.fn().mockResolvedValue({ id: "policy-1", name: POLICY_NAME }) },
    approvalRequestDAL: {
      findById: vi.fn(async () => approval),
      findByIdForUpdate: vi.fn(async () => approval),
      updateById,
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX))
    },
    appConnectionDAL: { findById: vi.fn().mockResolvedValue(connection) },
    membershipDAL: { isUserProjectMember: vi.fn().mockResolvedValue(isRequesterProjectMember) },
    kmsService: { createCipherPairWithDataKey: vi.fn() },
    auditLogService: { createAuditLog },
    approvalResources: { [ApprovalPolicyType.SecretAccess]: { postApprovalTxRoutine } },
    decisionNotifiers: { [ApprovalPolicyType.SecretAccess]: notify }
  } as never);
  const consumer = delegatedApprovalDecisionConsumerFactory({ delegatedApprovalDecisionService });

  return {
    consumer,
    row: () => row,
    approval: () => approval,
    postApprovalTxRoutine,
    createAuditLog,
    notify,
    updateById
  };
};

const makeEvent = (overrides?: Partial<TEvent>): TEvent => ({
  id: 1,
  eventType: DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest,
  payload: {
    delegatedRequestId: DELEGATED_REQUEST_ID,
    approvalRequestId: APPROVAL_REQUEST_ID,
    orgId: ORG_ID,
    event: DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest,
    externalId: EXTERNAL_ID
  },
  occurredAt: new Date(),
  ...overrides
});

const auditedWith = (createAuditLog: ReturnType<typeof vi.fn>, expected: Record<string, unknown>) => {
  expect(createAuditLog).toHaveBeenCalledTimes(1);
  expect(createAuditLog.mock.calls[0][0]).toMatchObject({
    orgId: ORG_ID,
    projectId: "project-1",
    event: {
      metadata: {
        requestId: APPROVAL_REQUEST_ID,
        policyName: POLICY_NAME,
        delegatedProviderRequestId: EXTERNAL_ID,
        permissions: REQUESTED_PERMISSIONS,
        ...expected
      }
    }
  });
};

beforeEach(() => {
  fetchDecision.mockReset();
});

describe("delegatedApprovalDecisionConsumer", () => {
  test("applies an approval: both rows move, the grant routine runs in the same transaction", async () => {
    fetchDecision.mockResolvedValueOnce(decided(DelegatedApprovalDecision.Approved));
    const { consumer, row, approval, postApprovalTxRoutine, createAuditLog, notify } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(fetchDecision.mock.calls[0][0]).toEqual({
      delegatedRequestId: DELEGATED_REQUEST_ID,
      approvalRequestId: APPROVAL_REQUEST_ID,
      providerRequestId: EXTERNAL_ID
    });
    expect(row()).toEqual({
      ...waitingDelegatedRequest,
      status: DelegatedApprovalRequestStatus.Approved,
      details: { statusReason: null, provider: SERVICENOW_RECORD }
    });
    expect(approval()?.status).toBe(ApprovalRequestStatus.Approved);
    expect(postApprovalTxRoutine).toHaveBeenCalledWith(expect.objectContaining({ id: APPROVAL_REQUEST_ID }), TX);
    auditedWith(createAuditLog, {
      outcome: DelegatedApprovalDecisionOutcome.Applied,
      decision: DelegatedApprovalDecision.Approved,
      decidedBy: "Grace Hopper",
      decidedAt: "2026-10-20 10:15:00",
      providerRecordNumber: "INFAR1000000"
    });
    expect(notify).toHaveBeenCalledWith({
      approvalRequestId: APPROVAL_REQUEST_ID,
      decision: DelegatedApprovalDecision.Approved
    });
  });

  test("applies a rejection without granting anything", async () => {
    fetchDecision.mockResolvedValueOnce(decided(DelegatedApprovalDecision.Rejected, { notes: "Not now." }));
    const { consumer, row, approval, postApprovalTxRoutine, createAuditLog } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Rejected);
    expect(approval()?.status).toBe(ApprovalRequestStatus.Rejected);
    expect(postApprovalTxRoutine).not.toHaveBeenCalled();
    auditedWith(createAuditLog, { decision: DelegatedApprovalDecision.Rejected, decisionNotes: "Not now." });
  });

  test("accepts the record's permissions in whatever order and padding the system stores them", async () => {
    fetchDecision.mockResolvedValueOnce(
      decided(DelegatedApprovalDecision.Approved, { permissions: ["secret-folders:edit", "secrets:read,create"] })
    );
    const { consumer, row } = buildConsumer();

    await consumer.handle([makeEvent()]);

    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Approved);
  });

  test("fails for good when the approved permissions differ from the request, and closes the request", async () => {
    fetchDecision.mockResolvedValueOnce(
      decided(DelegatedApprovalDecision.Approved, {
        permissions: ["secrets: read, create, delete", "secret-folders: edit"]
      })
    );
    const { consumer, row, approval, postApprovalTxRoutine, createAuditLog, notify } = buildConsumer();

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("approved different permissions");
    expect(result.error).toContain("Requested: secret-folders: edit; secrets: create, read");
    expect(result.error).toContain("Approved in ServiceNow: secret-folders: edit; secrets: create, delete, read");
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.Failed,
      details: { statusReason: result.error, provider: SERVICENOW_RECORD }
    });
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
    expect(postApprovalTxRoutine).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    auditedWith(createAuditLog, { outcome: DelegatedApprovalDecisionOutcome.Failed, reason: result.error });
  });

  test("fails for good when the record belongs to another request", async () => {
    fetchDecision.mockResolvedValueOnce(decided(DelegatedApprovalDecision.Approved, { approvalRequestId: "other" }));
    const { consumer, row, approval } = buildConsumer();

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Failed);
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
  });

  test("cancels a request whose requester was deleted without reading the decision", async () => {
    const { consumer, row, approval, postApprovalTxRoutine, createAuditLog } = buildConsumer({
      approvalRequest: { ...pendingApprovalRequest, requesterId: null }
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("was deleted");
    expect(fetchDecision).not.toHaveBeenCalled();
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.Failed,
      details: { statusReason: result.error }
    });
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
    expect(postApprovalTxRoutine).not.toHaveBeenCalled();
    auditedWith(createAuditLog, { outcome: DelegatedApprovalDecisionOutcome.Failed, reason: result.error });
  });

  test("cancels a request whose requester left the project without reading the decision", async () => {
    const { consumer, row, approval, postApprovalTxRoutine } = buildConsumer({ isRequesterProjectMember: false });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("no longer a member of this project");
    expect(fetchDecision).not.toHaveBeenCalled();
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Failed);
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
    expect(postApprovalTxRoutine).not.toHaveBeenCalled();
  });

  test("retries while the system has not recorded a decision, telling the user why", async () => {
    fetchDecision.mockResolvedValueOnce({ status: "pending", reason: "ServiceNow has not recorded a decision yet." });
    const { consumer, row, approval, createAuditLog } = buildConsumer();

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([
      { id: "1", status: EventResultStatus.Retry, error: "ServiceNow has not recorded a decision yet." }
    ]);
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.WaitingApproval,
      details: {
        statusReason: `ServiceNow has not recorded a decision yet. ${DELEGATED_APPROVAL_DECISION_RETRY_HINT}`,
        provider: SERVICENOW_RECORD
      }
    });
    expect(approval()?.status).toBe(ApprovalRequestStatus.Pending);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test("retries a transient read failure without touching the request", async () => {
    fetchDecision.mockRejectedValueOnce(new Error("ServiceNow could not be reached."));
    const { consumer, row, approval } = buildConsumer();

    const [result] = await consumer.handle([makeEvent()]);

    expect(result).toEqual({ id: "1", status: EventResultStatus.Retry, error: "ServiceNow could not be reached." });
    expect(row()).toMatchObject({ status: DelegatedApprovalRequestStatus.WaitingApproval });
    expect(row()?.details.statusReason).toContain(DELEGATED_APPROVAL_DECISION_RETRY_HINT);
    expect(approval()?.status).toBe(ApprovalRequestStatus.Pending);
  });

  test("fails for good on an unrecoverable read error", async () => {
    fetchDecision.mockRejectedValueOnce(new UnrecoverableError("ServiceNow rejected the credentials."));
    const { consumer, row, approval } = buildConsumer();

    const [result] = await consumer.handle([makeEvent()]);

    expect(result).toEqual({
      id: "1",
      status: EventResultStatus.Failed,
      error: "ServiceNow rejected the credentials."
    });
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.Failed,
      details: { statusReason: "ServiceNow rejected the credentials." }
    });
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
  });

  test("fails for good without reading when the policy names an unsupported delegated approval system", async () => {
    const { consumer, row, approval, createAuditLog } = buildConsumer({
      policy: { ...delegatedPolicy, type: "jira" as DelegatedApprovalPolicyType }
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toBe("The delegated approval system 'jira' is not supported. Create the request again.");
    expect(fetchDecision).not.toHaveBeenCalled();
    expect(row()).toMatchObject({
      status: DelegatedApprovalRequestStatus.Failed,
      details: { statusReason: result.error }
    });
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
    auditedWith(createAuditLog, {
      outcome: DelegatedApprovalDecisionOutcome.Failed,
      reason: result.error,
      delegatedApprovalType: "the delegated approval system"
    });
  });

  test.each([
    ["the delegated approver was removed from the policy", { policy: null }],
    ["the connection is gone", { connection: null }],
    ["the connection belongs to another org", { connection: { id: "connection-1", orgId: "other-org" } }]
  ])("fails for good without reading when %s", async (_, overrides) => {
    const { consumer, row, approval } = buildConsumer(overrides);

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(fetchDecision).not.toHaveBeenCalled();
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Failed);
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
  });

  test("records a decision that arrives after the request was cancelled, without granting", async () => {
    fetchDecision.mockResolvedValueOnce(decided(DelegatedApprovalDecision.Approved));
    const { consumer, row, approval, postApprovalTxRoutine, createAuditLog } = buildConsumer({
      approvalRequest: { ...pendingApprovalRequest, status: ApprovalRequestStatus.Cancelled }
    });

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Failed);
    expect(row()?.details.statusReason).toContain("after the request was cancelled");
    expect(approval()?.status).toBe(ApprovalRequestStatus.Cancelled);
    expect(postApprovalTxRoutine).not.toHaveBeenCalled();
    auditedWith(createAuditLog, { outcome: DelegatedApprovalDecisionOutcome.Failed });
  });

  test("expires a request whose decision arrives after its deadline", async () => {
    fetchDecision.mockResolvedValueOnce(decided(DelegatedApprovalDecision.Approved));
    const { consumer, row, approval, postApprovalTxRoutine } = buildConsumer({
      approvalRequest: { ...pendingApprovalRequest, expiresAt: new Date(Date.now() - 60_000) }
    });

    await consumer.handle([makeEvent()]);

    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.Failed);
    expect(row()?.details.statusReason).toContain("expired");
    expect(approval()?.status).toBe(ApprovalRequestStatus.Expired);
    expect(postApprovalTxRoutine).not.toHaveBeenCalled();
  });

  test.each([
    ["is gone", null],
    ["was approved", { ...waitingDelegatedRequest, status: DelegatedApprovalRequestStatus.Approved }],
    ["was rejected", { ...waitingDelegatedRequest, status: DelegatedApprovalRequestStatus.Rejected }],
    ["failed", { ...waitingDelegatedRequest, status: DelegatedApprovalRequestStatus.Failed }],
    ["was never sent", { ...waitingDelegatedRequest, status: DelegatedApprovalRequestStatus.PendingDispatch }]
  ])("marks the event delivered without reading when the request %s", async (_, delegatedRequest) => {
    const { consumer } = buildConsumer({ delegatedRequest });

    const results = await consumer.handle([makeEvent()]);

    expect(results).toEqual([{ id: "1", status: EventResultStatus.Delivered }]);
    expect(fetchDecision).not.toHaveBeenCalled();
  });

  test("audits without a record number when the provider never reported one", async () => {
    fetchDecision.mockResolvedValueOnce(decided(DelegatedApprovalDecision.Approved));
    const { consumer, createAuditLog } = buildConsumer({
      delegatedRequest: { ...waitingDelegatedRequest, details: { statusReason: null } }
    });

    await consumer.handle([makeEvent()]);

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    const [entry] = createAuditLog.mock.calls[0] as unknown as [{ event: { metadata: Record<string, unknown> } }];
    expect(entry.event.metadata).not.toHaveProperty("providerRecordNumber");
  });

  test("fails the event, not the request, when the callback names another record", async () => {
    const { consumer, row } = buildConsumer({
      delegatedRequest: { ...waitingDelegatedRequest, providerRequestId: "snow-2" }
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(fetchDecision).not.toHaveBeenCalled();
    expect(row()?.status).toBe(DelegatedApprovalRequestStatus.WaitingApproval);
  });

  test("fails an unreadable payload terminally", async () => {
    const { consumer } = buildConsumer();

    const [result] = await consumer.handle([makeEvent({ payload: { delegatedRequestId: "not-a-uuid" } })]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("Unreadable delegated approval callback payload");
    expect(fetchDecision).not.toHaveBeenCalled();
  });
});

// Why the read-back is an outbox consumer: a record whose decision is not stored yet is tried again
// later, instead of being dropped by a callback that answered 200 before anything was read.
describe("delegatedApprovalDecisionConsumer through the outbox", () => {
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

  test("retries a record without a decision and applies it on a later flush", async () => {
    fetchDecision
      .mockResolvedValueOnce({ status: "pending", reason: "Not yet." })
      .mockResolvedValueOnce(decided(DelegatedApprovalDecision.Approved));
    const built = buildConsumer();
    const { service, rows, elapseBackoff } = buildOutbox(built.consumer);
    const { payload } = makeEvent();

    await service.emit({
      eventType: DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest,
      payload: payload as Record<string, unknown>
    });
    await service.drain({ consumer: built.consumer.name });

    expect(rows[0]).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1, lastError: "Not yet." });
    expect(built.row()?.status).toBe(DelegatedApprovalRequestStatus.WaitingApproval);

    elapseBackoff();
    await service.drain({ consumer: built.consumer.name });

    expect(rows[0]).toMatchObject({ status: EventOutboxStatus.Delivered, attempts: 2 });
    expect(built.row()?.status).toBe(DelegatedApprovalRequestStatus.Approved);
    expect(fetchDecision).toHaveBeenCalledTimes(2);
  });
});
