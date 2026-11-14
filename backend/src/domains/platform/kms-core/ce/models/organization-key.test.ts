import { RuleViolationError } from "@app/domains/lib/errors";

import { OrganizationKey } from "./organization-key";

const empty = () => OrganizationKey.restore({ orgId: "org-1", kmsKeyId: null, encryptedDataKey: null });

describe("OrganizationKey", () => {
  test("should start with no KMS key and no data key", () => {
    const key = empty();

    expect(key.hasKmsKey()).toBe(false);
    expect(key.hasDataKey()).toBe(false);
  });

  test("should assign the KMS key and then the data key", () => {
    const key = empty();

    key.assignKmsKey("kms-1");
    key.assignDataKey(Buffer.from("dk"));

    expect(key.hasKmsKey()).toBe(true);
    expect(key.hasDataKey()).toBe(true);
    expect(key.toJSON()).toEqual({ orgId: "org-1", kmsKeyId: "kms-1", encryptedDataKey: Buffer.from("dk") });
  });

  test("should refuse a data key before a KMS key", () => {
    expect(() => empty().assignDataKey(Buffer.from("dk"))).toThrow(RuleViolationError);
  });

  test("should refuse to replace a KMS key or a data key", () => {
    const key = empty();
    key.assignKmsKey("kms-1");
    key.assignDataKey(Buffer.from("dk"));

    expect(() => key.assignKmsKey("kms-2")).toThrow(RuleViolationError);
    expect(() => key.assignDataKey(Buffer.from("other"))).toThrow(RuleViolationError);
  });

  test("should give the pair as material once both exist", () => {
    const key = OrganizationKey.restore({ orgId: "org-1", kmsKeyId: "kms-1", encryptedDataKey: Buffer.from("dk") });

    expect(key.material().toJSON()).toEqual({ kmsKeyId: "kms-1", encryptedDataKey: Buffer.from("dk"), orgId: "org-1" });
  });

  test("should refuse material while the pair is incomplete", () => {
    const keyOnly = OrganizationKey.restore({ orgId: "org-1", kmsKeyId: "kms-1", encryptedDataKey: null });

    expect(() => empty().material()).toThrow(new RuleViolationError({ message: "Invalid organization KMS" }));
    expect(() => keyOnly.material()).toThrow("Invalid organization KMS");
  });
});
