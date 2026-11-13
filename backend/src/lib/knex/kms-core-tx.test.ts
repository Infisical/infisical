import type { Knex } from "knex";

import { KmsDataKey, ReadFrom, TDataKeyService } from "@app/domains/platform/kms-core/ce/module";

import { dataKeysOn } from "./kms-core-tx";

const context = { type: KmsDataKey.SecretManager, projectId: "project-1" } as const;

const makeService = () => {
  const joined = { createCipherPairWithDataKey: vi.fn().mockResolvedValue("joined") };
  const service = {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue("pool"),
    within: vi.fn().mockReturnValue(joined)
  };
  return { service, joined, dataKeyService: service as unknown as TDataKeyService };
};

describe("dataKeysOn", () => {
  test("should join a Knex transaction", async () => {
    // Setup
    const { service, joined, dataKeyService } = makeService();
    const trx = { isTransaction: true, executionPromise: Promise.resolve() } as unknown as Knex;

    // Action
    const result = await dataKeysOn(dataKeyService, trx).createCipherPairWithDataKey(context);

    // Assert
    expect(result).toBe("joined");
    expect(service.within).toHaveBeenCalledTimes(1);
    expect(joined.createCipherPairWithDataKey).toHaveBeenCalledWith(context);
    expect(service.createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("should read the primary for a plain connection instead of trying to join it", async () => {
    // Setup
    const { service, dataKeyService } = makeService();
    const connection = {} as Knex;

    // Action
    const result = await dataKeysOn(dataKeyService, connection).createCipherPairWithDataKey(context);

    // Assert
    expect(result).toBe("pool");
    expect(service.within).not.toHaveBeenCalled();
    expect(service.createCipherPairWithDataKey).toHaveBeenCalledWith(context, { readFrom: ReadFrom.Primary });
  });

  test("should use the service directly without a connection", async () => {
    // Setup
    const { service, dataKeyService } = makeService();

    // Action
    await dataKeysOn(dataKeyService).createCipherPairWithDataKey(context);

    // Assert
    expect(service.createCipherPairWithDataKey).toHaveBeenCalledWith(context, undefined);
  });
});
