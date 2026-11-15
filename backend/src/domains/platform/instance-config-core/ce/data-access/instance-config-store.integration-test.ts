import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { InstanceConfig } from "../models/instance-config";
import { describeInstanceConfigStoreContract } from "../testing/instance-config-store-contract";
import { InstanceConfigStore } from "./instance-config-store";

const h = setupIntegration({ freshDatabase: true });

describeInstanceConfigStoreContract("InstanceConfigStore", async () => {
  await h.db(TableName.SuperAdmin).delete();
  return {
    store: new InstanceConfigStore(poolStoreConnection(h.db)),
    addSamlOrg: async () => {
      const org = await h.factories.organization();
      await h.db(TableName.SamlConfig).insert({
        orgId: org.id,
        authProvider: "okta-saml",
        isActive: true,
        encryptedSamlEntryPoint: Buffer.from(randomUUID()),
        encryptedSamlIssuer: Buffer.from(randomUUID()),
        encryptedSamlCertificate: Buffer.from(randomUUID())
      });
      return { id: org.id, slug: org.slug };
    }
  };
});

describe("InstanceConfigStore.readFipsSetting", () => {
  test("should return null on a database without the table", async () => {
    // Setup
    const empty = await h.newDatabase();

    // Action
    const result = await InstanceConfigStore.readFipsSetting(empty.db);

    // Assert
    expect(result).toBeNull();
  });

  test("should return null when there is no row", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).delete();

    // Action
    const result = await InstanceConfigStore.readFipsSetting(h.db);

    // Assert
    expect(result).toBeNull();
  });

  test("should return true when the stored row is in FIPS mode", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).delete();
    const store = new InstanceConfigStore(poolStoreConnection(h.db));
    await store.createIfMissing(InstanceConfig.create({ fipsEnabled: true }));

    // Action
    const result = await InstanceConfigStore.readFipsSetting(h.db);

    // Assert
    expect(result).toBe(true);
  });
});

describe("InstanceConfigStore.readInitialized", () => {
  test("should return false on a database without the table", async () => {
    // Setup
    const empty = await h.newDatabase();

    // Action
    const result = await InstanceConfigStore.readInitialized(empty.db);

    // Assert
    expect(result).toBe(false);
  });

  test("should return false until setup completed and true after", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).delete();
    const store = new InstanceConfigStore(poolStoreConnection(h.db));
    await store.createIfMissing(InstanceConfig.create({ fipsEnabled: false }));
    const before = await InstanceConfigStore.readInitialized(h.db);
    const config = await store.find();
    if (!config) throw new Error("row missing");
    config.completeSetup({ closeSignUp: false });

    // Action
    await store.save(config);

    // Assert
    expect(before).toBe(false);
    expect(await InstanceConfigStore.readInitialized(h.db)).toBe(true);
  });
});
