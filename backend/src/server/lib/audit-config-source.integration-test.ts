import { TableName } from "@app/db/schemas";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { projectDALFactory } from "@app/services/project/project-dal";

import { AuditConfigSource } from "./audit-config-source";

describe("AuditConfigSource.forProject on Postgres", () => {
  const h = setupIntegration();

  const build = () =>
    new AuditConfigSource(
      new FakeLicenseService(),
      projectDALFactory(h.db),
      { getEffectiveSettings: async () => null },
      new InMemoryKeyStore() as never
    );

  test("should read the project's name and audit log retention", async () => {
    // Setup
    const tn = await h.newTenant();
    await h.db(TableName.Project).where({ id: tn.project.id }).update({ auditLogsRetentionDays: 7 });

    // Action
    const config = await build().forProject(tn.org.id, tn.project.id);

    // Assert
    expect(config).toEqual({ name: tn.project.name, retentionDays: 7 });
  });

  test("should refuse a project from another organization", async () => {
    // Setup
    const tn = await h.newTenant();
    const other = await h.newTenant();

    // Action
    const config = await build().forProject(other.org.id, tn.project.id);

    // Assert
    expect(config).toBeNull();
  });
});
