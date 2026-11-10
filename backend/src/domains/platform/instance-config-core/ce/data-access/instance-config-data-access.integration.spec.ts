import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { InstanceConfig } from "../model/instance-config";
import { buildInstanceConfigCoreDataAccessDeps } from "../module";
import { describeInstanceConfigDataAccessContract } from "../testing/instance-config-data-access-contract";
import { InstanceConfigDataAccess } from "./instance-config-data-access";

describe("InstanceConfigDataAccess on Postgres", () => {
  // super_admin holds one row for the whole instance, so this describe gets its own database.
  const h = setupIntegration({ freshDatabase: true });

  describeInstanceConfigDataAccessContract("postgres", () => ({
    build: async () => {
      await h.db(TableName.SuperAdmin).del();
      return buildInstanceConfigCoreDataAccessDeps(DataAccessDb.fromClient(h.db));
    },
    addSamlOrg: async () => {
      const org = await h.factories.organization();
      await h.db(TableName.SamlConfig).insert({
        orgId: org.id,
        authProvider: "okta-saml",
        isActive: true,
        encryptedSamlEntryPoint: Buffer.from("entry-point"),
        encryptedSamlIssuer: Buffer.from("issuer"),
        encryptedSamlCertificate: Buffer.from("certificate")
      });
      return { id: org.id, slug: org.slug };
    }
  }));

  describe("InstanceConfigDataAccess.readFipsSetting", () => {
    test("should return null before migrations created the table", async () => {
      // Setup
      const empty = await h.newDatabase();

      // Action
      const setting = await InstanceConfigDataAccess.readFipsSetting(empty.db);

      // Assert
      expect(setting).toBeNull();
    });

    test("should return null when the table has no row", async () => {
      // Setup
      await h.db(TableName.SuperAdmin).del();

      // Action
      const setting = await InstanceConfigDataAccess.readFipsSetting(h.db);

      // Assert
      expect(setting).toBeNull();
    });

    test("should return the stored FIPS setting", async () => {
      // Setup
      await h.db(TableName.SuperAdmin).del();
      const { transactionRunner } = buildInstanceConfigCoreDataAccessDeps(DataAccessDb.fromClient(h.db));
      await transactionRunner.run(({ dataAccess }) =>
        dataAccess.instanceConfig.createIfMissing(InstanceConfig.initialSettings({ fipsEnabled: true }))
      );

      // Action
      const setting = await InstanceConfigDataAccess.readFipsSetting(h.db);

      // Assert
      expect(setting).toBe(true);
    });
  });
});
