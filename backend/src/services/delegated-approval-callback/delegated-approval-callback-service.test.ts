import { describe, expect, test, vi } from "vitest";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

// eslint-disable-next-line import/first
import { ForbiddenRequestError } from "@app/lib/errors";
// eslint-disable-next-line import/first
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
// eslint-disable-next-line import/first
import { DelegatedApprovalRequestStatus } from "@app/services/delegated-approval/delegated-approval-enums";
// eslint-disable-next-line import/first
import { KmsDataKey } from "@app/services/kms/kms-types";

// eslint-disable-next-line import/first
import {
  DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS,
  DELEGATED_APPROVAL_CALLBACK_PATH,
  DELEGATED_APPROVAL_DECISION_READ_CLAIM_TTL_MS
} from "./delegated-approval-callback-constants";
// eslint-disable-next-line import/first
import { DelegatedApprovalCallbackEvent } from "./delegated-approval-callback-enums";
// eslint-disable-next-line import/first
import { buildDelegatedApprovalCallbackEventId } from "./delegated-approval-callback-events";
// eslint-disable-next-line import/first
import { delegatedApprovalCallbackServiceFactory } from "./delegated-approval-callback-service";

const CIPHER_PREFIX = Buffer.from("enc:");

const encrypt = (plainText: Buffer) => Buffer.concat([CIPHER_PREFIX, plainText]);
const decrypt = (cipherTextBlob: Buffer) => cipherTextBlob.subarray(CIPHER_PREFIX.length);

const TX = { isTx: true };
const PRIMARY = { isPrimary: true };

const makeService = ({
  stored = true,
  currentRow = null,
  approvalRequest = { id: "req-1", projectId: "project-1" }
}: {
  stored?: boolean;
  currentRow?: { encryptedCallbackToken: Buffer | null } | null;
  approvalRequest?: { id: string; projectId: string } | null;
} = {}) => {
  const delegatedApprovalRequestDAL = {
    update: vi.fn(async (_filter: unknown, patch: object) => (stored ? [{ id: "delegated-1", ...patch }] : [])),
    updateWithDetails: vi.fn(async (_filter: unknown, patch: object) =>
      stored ? [{ id: "delegated-1", ...patch }] : []
    ),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(TX)),
    primaryNode: vi.fn(() => PRIMARY),
    findById: vi.fn(async (): Promise<unknown> => currentRow),
    findByProviderRequestId: vi.fn(async (): Promise<unknown> => null),
    claimDecisionRead: vi.fn(async (): Promise<unknown> => ({ id: "delegated-1" }))
  };
  const kmsService = {
    createCipherPairWithDataKey: vi.fn(async () => ({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: encrypt(plainText) }),
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => decrypt(cipherTextBlob)
    }))
  };
  const approvalRequestDAL = {
    findById: vi.fn(async () => approvalRequest),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(TX)),
    findByIdForUpdate: vi.fn(async (): Promise<unknown> => null),
    updateById: vi.fn(async () => null)
  };
  const eventEmitter = { emit: vi.fn(async () => {}) };

  const service = delegatedApprovalCallbackServiceFactory({
    delegatedApprovalRequestDAL: delegatedApprovalRequestDAL as never,
    approvalRequestDAL: approvalRequestDAL as never,
    kmsService: kmsService as never,
    eventEmitter
  });

  return { service, delegatedApprovalRequestDAL, approvalRequestDAL, kmsService, eventEmitter };
};

describe("getCallbackUrl", () => {
  test("builds the callback URL from SITE_URL", () => {
    const { service } = makeService();

    expect(service.getCallbackUrl()).toBe(`https://app.infisical.com${DELEGATED_APPROVAL_CALLBACK_PATH}`);
  });
});

describe("getOrIssueCallbackToken", () => {
  const delegatedRequest = { id: "delegated-1", requestId: "req-1", encryptedCallbackToken: null };

  test("issues a token once and stores it encrypted under the project key", async () => {
    const { service, delegatedApprovalRequestDAL, approvalRequestDAL, kmsService } = makeService();

    const token = await service.getOrIssueCallbackToken({ delegatedRequest });

    expect(token).toBeTruthy();
    expect(approvalRequestDAL.findById).toHaveBeenCalledWith("req-1", PRIMARY);
    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledWith({
      type: KmsDataKey.SecretManager,
      projectId: "project-1"
    });
    expect(delegatedApprovalRequestDAL.update).toHaveBeenCalledWith(
      { id: "delegated-1", encryptedCallbackToken: null },
      { encryptedCallbackToken: encrypt(Buffer.from(token as string)) }
    );
  });

  test("resends the token the request already holds instead of issuing another", async () => {
    const { service, delegatedApprovalRequestDAL } = makeService();

    const token = await service.getOrIssueCallbackToken({
      delegatedRequest: { ...delegatedRequest, encryptedCallbackToken: encrypt(Buffer.from("first-token")) }
    });

    expect(token).toBe("first-token");
    expect(delegatedApprovalRequestDAL.update).not.toHaveBeenCalled();
  });

  test("falls back to the token a concurrent attempt stored first, read from the primary", async () => {
    const { service, delegatedApprovalRequestDAL } = makeService({
      stored: false,
      currentRow: { encryptedCallbackToken: encrypt(Buffer.from("winner-token")) }
    });

    const token = await service.getOrIssueCallbackToken({ delegatedRequest });

    expect(token).toBe("winner-token");
    expect(delegatedApprovalRequestDAL.findById).toHaveBeenCalledWith("delegated-1", PRIMARY);
  });

  test("returns null when the request vanished before a token could be stored", async () => {
    const { service } = makeService({ stored: false, currentRow: { encryptedCallbackToken: null } });

    const token = await service.getOrIssueCallbackToken({ delegatedRequest });

    expect(token).toBeNull();
  });

  test("returns null without issuing a token when the approval request is gone", async () => {
    const { service, delegatedApprovalRequestDAL, kmsService } = makeService({ approvalRequest: null });

    const token = await service.getOrIssueCallbackToken({ delegatedRequest });

    expect(token).toBeNull();
    expect(kmsService.createCipherPairWithDataKey).not.toHaveBeenCalled();
    expect(delegatedApprovalRequestDAL.update).not.toHaveBeenCalled();
  });
});

describe("handleCallback", () => {
  const TOKEN = "inf_ext_stored-token";
  const EXTERNAL_ID = "9d41f2a7c3b24e1088f6a05e7b1d4c93";
  const EVENT = DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest;

  const makeDelegatedRequest = (overrides?: Record<string, unknown>) => ({
    id: "delegated-1",
    requestId: "request-1",
    status: DelegatedApprovalRequestStatus.WaitingApproval,
    encryptedCallbackToken: encrypt(Buffer.from(TOKEN)),
    providerRequestId: EXTERNAL_ID,
    callbackAttempts: 0,
    approvalRequestOrganizationId: "org-1",
    approvalRequestProjectId: "project-1",
    ...overrides
  });

  const makeCallbackService = ({
    delegatedRequest = makeDelegatedRequest(),
    attemptsAfterIncrement = 1,
    lockedApprovalRequest = { id: "request-1", status: ApprovalRequestStatus.Pending }
  }: {
    delegatedRequest?: ReturnType<typeof makeDelegatedRequest> | null;
    attemptsAfterIncrement?: number;
    lockedApprovalRequest?: { id: string; status: ApprovalRequestStatus } | null;
  } = {}) => {
    const built = makeService();
    built.delegatedApprovalRequestDAL.findByProviderRequestId.mockResolvedValue(delegatedRequest);
    built.delegatedApprovalRequestDAL.update.mockResolvedValue([
      { ...delegatedRequest, callbackAttempts: attemptsAfterIncrement }
    ] as never);
    built.approvalRequestDAL.findByIdForUpdate.mockResolvedValue(lockedApprovalRequest);
    return built;
  };

  const callback = (overrides?: Partial<{ token: string | undefined; event: typeof EVENT; externalId: string }>) => ({
    token: TOKEN,
    event: EVENT,
    externalId: EXTERNAL_ID,
    ...overrides
  });

  test("refuses an external ID no request has with the same 403 as any other refusal", async () => {
    const { service, delegatedApprovalRequestDAL, eventEmitter } = makeCallbackService({ delegatedRequest: null });

    await expect(service.handleCallback(callback())).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(delegatedApprovalRequestDAL.findByProviderRequestId).toHaveBeenCalledWith(EXTERNAL_ID);
    expect(delegatedApprovalRequestDAL.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", undefined],
    ["unprefixed", "stored-token"],
    ["mismatched", "inf_ext_other-token"]
  ])("rejects a %s token without counting it, even when it would pass the limit", async (_label, token) => {
    const { service, delegatedApprovalRequestDAL, approvalRequestDAL, eventEmitter } = makeCallbackService({
      delegatedRequest: makeDelegatedRequest({ callbackAttempts: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS }),
      attemptsAfterIncrement: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS + 1
    });

    await expect(service.handleCallback(callback({ token }))).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(delegatedApprovalRequestDAL.update).not.toHaveBeenCalled();
    expect(delegatedApprovalRequestDAL.updateWithDetails).not.toHaveBeenCalled();
    expect(approvalRequestDAL.updateById).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  test("counts a callback that claims the read-back, in the claim's transaction", async () => {
    const { service, delegatedApprovalRequestDAL } = makeCallbackService();

    await service.handleCallback(callback());

    expect(delegatedApprovalRequestDAL.update).toHaveBeenCalledWith(
      { id: "delegated-1" },
      { $incr: { callbackAttempts: 1 } },
      TX
    );
    expect(delegatedApprovalRequestDAL.claimDecisionRead.mock.invocationCallOrder[0]).toBeLessThan(
      delegatedApprovalRequestDAL.update.mock.invocationCallOrder[0]
    );
  });

  test("locks the approval request before claiming the read-back", async () => {
    const { service, delegatedApprovalRequestDAL, approvalRequestDAL } = makeCallbackService();

    await service.handleCallback(callback());

    expect(approvalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith("request-1", TX);
    expect(approvalRequestDAL.findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      delegatedApprovalRequestDAL.claimDecisionRead.mock.invocationCallOrder[0]
    );
  });

  test("rejects a request that is not awaiting a decision without counting it", async () => {
    const { service, delegatedApprovalRequestDAL, eventEmitter } = makeCallbackService({
      delegatedRequest: makeDelegatedRequest({ status: DelegatedApprovalRequestStatus.Approved })
    });

    await expect(service.handleCallback(callback())).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(delegatedApprovalRequestDAL.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  test("fails the request and cancels its approval request on the callback past the limit", async () => {
    const { service, delegatedApprovalRequestDAL, approvalRequestDAL, eventEmitter } = makeCallbackService({
      attemptsAfterIncrement: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS + 1
    });

    await expect(service.handleCallback(callback())).rejects.toBeInstanceOf(ForbiddenRequestError);

    expect(approvalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith("request-1", TX);
    expect(approvalRequestDAL.updateById).toHaveBeenCalledWith(
      "request-1",
      { status: ApprovalRequestStatus.Cancelled },
      TX
    );
    const [filter, patch, tx] = delegatedApprovalRequestDAL.updateWithDetails.mock.lastCall as unknown as [
      unknown,
      { status: string; details: { statusReason: string } },
      unknown
    ];
    expect(filter).toEqual({ id: "delegated-1", status: DelegatedApprovalRequestStatus.WaitingApproval });
    expect(patch.status).toBe(DelegatedApprovalRequestStatus.Failed);
    expect(patch.details.statusReason).toContain(`more than ${DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS} times`);
    expect(tx).toBe(TX);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  test("leaves an approval request that is no longer pending alone when attempts run out", async () => {
    const { service, delegatedApprovalRequestDAL, approvalRequestDAL } = makeCallbackService({
      attemptsAfterIncrement: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS + 1,
      lockedApprovalRequest: { id: "request-1", status: ApprovalRequestStatus.Expired }
    });

    await expect(service.handleCallback(callback())).rejects.toBeInstanceOf(ForbiddenRequestError);

    expect(approvalRequestDAL.updateById).not.toHaveBeenCalled();
    const [, patch] = delegatedApprovalRequestDAL.updateWithDetails.mock.lastCall as unknown as [
      unknown,
      { status: string }
    ];
    expect(patch.status).toBe(DelegatedApprovalRequestStatus.Failed);
  });

  test("still accepts the callback at the limit", async () => {
    const { service, eventEmitter } = makeCallbackService({
      attemptsAfterIncrement: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS
    });

    await expect(service.handleCallback(callback())).resolves.toEqual({ delegatedRequestId: "delegated-1" });
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
  });

  test("emits an outbox event keyed on the delegated request", async () => {
    const { service, eventEmitter, kmsService } = makeCallbackService();

    await expect(service.handleCallback(callback())).resolves.toEqual({ delegatedRequestId: "delegated-1" });

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledWith({
      type: KmsDataKey.SecretManager,
      projectId: "project-1"
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      [
        {
          id: buildDelegatedApprovalCallbackEventId({ delegatedRequestId: "delegated-1", attempts: 1 }),
          type: EVENT,
          data: {
            delegatedRequestId: "delegated-1",
            approvalRequestId: "request-1",
            orgId: "org-1",
            event: EVENT,
            externalId: EXTERNAL_ID
          }
        }
      ],
      TX
    );
  });

  test("claims the read-back in the emit's transaction, expiring claims older than their TTL", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T12:00:00.000Z") });
    try {
      const { service, delegatedApprovalRequestDAL } = makeCallbackService();

      await service.handleCallback(callback());

      expect(delegatedApprovalRequestDAL.claimDecisionRead).toHaveBeenCalledWith(
        { id: "delegated-1", staleBefore: new Date(Date.now() - DELEGATED_APPROVAL_DECISION_READ_CLAIM_TTL_MS) },
        TX
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("accepts a repeat without emitting while another read-back holds the claim", async () => {
    const { service, delegatedApprovalRequestDAL, eventEmitter } = makeCallbackService();
    delegatedApprovalRequestDAL.claimDecisionRead.mockResolvedValue(null);
    delegatedApprovalRequestDAL.findById.mockResolvedValue(makeDelegatedRequest());

    await expect(service.handleCallback(callback())).resolves.toEqual({ delegatedRequestId: "delegated-1" });
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  test("does not count a repeat while another read-back holds the claim, even at the limit", async () => {
    const atLimit = makeDelegatedRequest({ callbackAttempts: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS });
    const { service, delegatedApprovalRequestDAL, approvalRequestDAL } = makeCallbackService({
      delegatedRequest: atLimit,
      attemptsAfterIncrement: DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS + 1
    });
    delegatedApprovalRequestDAL.claimDecisionRead.mockResolvedValue(null);
    delegatedApprovalRequestDAL.findById.mockResolvedValue(atLimit);

    await expect(service.handleCallback(callback())).resolves.toEqual({ delegatedRequestId: "delegated-1" });
    expect(delegatedApprovalRequestDAL.update).not.toHaveBeenCalled();
    expect(delegatedApprovalRequestDAL.updateWithDetails).not.toHaveBeenCalled();
    expect(approvalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("rejects a callback whose request stopped awaiting a decision before the claim", async () => {
    const { service, delegatedApprovalRequestDAL, eventEmitter } = makeCallbackService();
    delegatedApprovalRequestDAL.claimDecisionRead.mockResolvedValue(null);
    delegatedApprovalRequestDAL.findById.mockResolvedValue(
      makeDelegatedRequest({ status: DelegatedApprovalRequestStatus.Approved })
    );

    await expect(service.handleCallback(callback())).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
