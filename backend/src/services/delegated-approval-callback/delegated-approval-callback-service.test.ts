import { describe, expect, test, vi } from "vitest";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

// eslint-disable-next-line import/first
import { KmsDataKey } from "@app/services/kms/kms-types";

// eslint-disable-next-line import/first
import { DELEGATED_APPROVAL_CALLBACK_PATH } from "./delegated-approval-callback-constants";
// eslint-disable-next-line import/first
import { delegatedApprovalCallbackServiceFactory } from "./delegated-approval-callback-service";

const CIPHER_PREFIX = Buffer.from("enc:");

const encrypt = (plainText: Buffer) => Buffer.concat([CIPHER_PREFIX, plainText]);
const decrypt = (cipherTextBlob: Buffer) => cipherTextBlob.subarray(CIPHER_PREFIX.length);

const PRIMARY = { primary: true };

const delegatedRequest = { id: "delegated-1", requestId: "req-1", encryptedCallbackToken: null };

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
    update: vi.fn(async () => (stored ? [{ id: "delegated-1" }] : [])),
    primaryNode: vi.fn(() => PRIMARY),
    findById: vi.fn(async () => currentRow)
  };
  const approvalRequestDAL = { findById: vi.fn(async () => approvalRequest) };
  const kmsService = {
    createCipherPairWithDataKey: vi.fn(async () => ({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: encrypt(plainText) }),
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => decrypt(cipherTextBlob)
    }))
  };

  const service = delegatedApprovalCallbackServiceFactory({
    delegatedApprovalRequestDAL: delegatedApprovalRequestDAL as never,
    approvalRequestDAL: approvalRequestDAL as never,
    kmsService: kmsService as never
  });

  return { service, delegatedApprovalRequestDAL, approvalRequestDAL, kmsService };
};

describe("getCallbackUrl", () => {
  test("builds the callback URL from SITE_URL", () => {
    const { service } = makeService();

    expect(service.getCallbackUrl()).toBe(`https://app.infisical.com${DELEGATED_APPROVAL_CALLBACK_PATH}`);
  });
});

describe("getOrIssueCallbackToken", () => {
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

  test("falls back to the token a concurrent attempt stored first", async () => {
    const { service } = makeService({
      stored: false,
      currentRow: { encryptedCallbackToken: encrypt(Buffer.from("winner-token")) }
    });

    const token = await service.getOrIssueCallbackToken({ delegatedRequest });

    expect(token).toBe("winner-token");
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
