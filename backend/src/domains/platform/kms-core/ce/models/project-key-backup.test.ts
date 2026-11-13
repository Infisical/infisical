import { RuleViolationError } from "@app/domains/lib/errors";

import { ProjectKeyBackup } from "./project-key-backup";

describe("ProjectKeyBackup", () => {
  const create = () =>
    ProjectKeyBackup.create({ projectId: "p1", kmsKeyId: "k1", encryptedDataKey: Buffer.from("data") });

  test("should use the frozen v1 format and parse back", () => {
    const text = create().toString();

    expect(text).toMatch(/^v1\.p1\.secretManager\.k1\.ZGF0YQ==\.[0-9a-f]{64}$/);
    const parsed = ProjectKeyBackup.parse(text, "p1");
    expect(parsed.kmsKeyId).toBe("k1");
    expect(parsed.encryptedDataKey).toEqual(Buffer.from("data"));
  });

  test("should refuse a tampered backup", () => {
    const tampered = create().toString().replace("k1", "k2");

    expect(() => ProjectKeyBackup.parse(tampered, "p1")).toThrow(new RuleViolationError({ message: "Invalid backup" }));
  });

  test("should refuse a backup written for another project", () => {
    expect(() => ProjectKeyBackup.parse(create().toString(), "p2")).toThrow("Backup does not belong to project");
  });
});
