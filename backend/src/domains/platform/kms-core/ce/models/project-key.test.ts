import { RuleViolationError } from "@app/domains/lib/errors";

import { EncryptedDataKey } from "./encrypted-data-key";
import { ProjectKey } from "./project-key";
import { ProjectKeyBackup } from "./project-key-backup";

const record = {
  projectId: "project-1",
  orgId: "org-1",
  kmsKeyId: "kms-1",
  encryptedDataKey: Buffer.from("dk"),
  certificateKmsKeyId: null
};
const complete = () => ProjectKey.restore(record);
const empty = () =>
  ProjectKey.restore({ ...record, kmsKeyId: null, encryptedDataKey: null, certificateKmsKeyId: null });

describe("ProjectKey", () => {
  test("should assign the KMS key, the data key and the certificate key once each", () => {
    const key = empty();

    key.assignKmsKey("kms-1");
    key.assignDataKey(Buffer.from("dk"));
    key.assignCertificateKey("cert-1");

    expect(key.toJSON()).toEqual({ ...record, certificateKmsKeyId: "cert-1" });
    expect(() => key.assignKmsKey("kms-2")).toThrow(RuleViolationError);
    expect(() => key.assignDataKey(Buffer.from("x"))).toThrow(RuleViolationError);
    expect(() => key.assignCertificateKey("cert-2")).toThrow(RuleViolationError);
  });

  test("should refuse a data key before a KMS key", () => {
    expect(() => empty().assignDataKey(Buffer.from("dk"))).toThrow(RuleViolationError);
  });

  test("should return the previous KMS key id when switching", () => {
    const key = complete();

    const previous = key.switchTo("kms-2", Buffer.from("rewrapped"));

    expect(previous).toBe("kms-1");
    expect(key.material().toJSON()).toEqual({
      kmsKeyId: "kms-2",
      encryptedDataKey: Buffer.from("rewrapped"),
      orgId: "org-1"
    });
  });

  test("should refuse to switch a project that has no data key", () => {
    expect(() => empty().switchTo("kms-2", Buffer.from("x"))).toThrow(RuleViolationError);
  });

  test("should refuse material while the pair is incomplete", () => {
    expect(() => empty().material()).toThrow("Invalid project KMS");
  });

  test("should back up the data key wrapped under the org key", () => {
    const wrapped = EncryptedDataKey.restore({
      kmsKeyId: "org-kms",
      encryptedDataKey: Buffer.from("w"),
      orgId: "org-1"
    });

    const backup = complete().backup(wrapped);

    expect(backup.projectId).toBe("project-1");
    expect(backup.kmsKeyId).toBe("org-kms");
    expect(ProjectKeyBackup.parse(backup.toString(), "project-1").encryptedDataKey).toEqual(Buffer.from("w"));
  });

  test("should refuse a backup wrapped under another org's key", () => {
    const wrapped = EncryptedDataKey.restore({ kmsKeyId: "k", encryptedDataKey: Buffer.from("w"), orgId: "org-2" });

    expect(() => complete().backup(wrapped)).toThrow(RuleViolationError);
  });

  test("should restore from a backup of its own project and org", () => {
    const key = complete();
    const backup = ProjectKeyBackup.create({
      projectId: "project-1",
      kmsKeyId: "org-kms",
      encryptedDataKey: Buffer.from("w")
    });
    const restored = EncryptedDataKey.restore({
      kmsKeyId: "kms-9",
      encryptedDataKey: Buffer.from("r"),
      orgId: "org-1"
    });

    key.restoreFrom(backup, "org-1", restored);

    expect(key.material().toJSON()).toEqual(restored.toJSON());
  });

  test("should refuse a backup of another project or one whose key belongs to another org", () => {
    const key = complete();
    const other = ProjectKeyBackup.create({
      projectId: "project-2",
      kmsKeyId: "k",
      encryptedDataKey: Buffer.from("w")
    });
    const own = ProjectKeyBackup.create({ projectId: "project-1", kmsKeyId: "k", encryptedDataKey: Buffer.from("w") });
    const restored = EncryptedDataKey.restore({
      kmsKeyId: "kms-9",
      encryptedDataKey: Buffer.from("r"),
      orgId: "org-1"
    });

    expect(() => key.assertRestorable(other, "org-1")).toThrow("Backup does not belong to project");
    expect(() => key.restoreFrom(own, "org-2", restored)).toThrow("Backup does not belong to project");
    expect(key.material().kmsKeyId).toBe("kms-1");
  });
});
