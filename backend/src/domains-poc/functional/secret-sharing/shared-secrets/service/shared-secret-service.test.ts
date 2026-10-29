import { createFakeKmsCoreService } from "@app/domains-poc/functional/platform/kms-core/testing/fake-kms-core-service";

import { TSharedSecretActor } from "../model/shared-secret";
import {
  createInMemorySecretSharingUnitOfWork,
  createInMemorySharedSecretRepository
} from "../testing/in-memory-shared-secret-repository";
import { createSharedSecretService } from "./shared-secret-service";

const creator: TSharedSecretActor = { type: "user", id: "user-1", orgId: "org-1" };
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

const setup = () => {
  const { rows, repository } = createInMemorySharedSecretRepository();
  const sharedSecretService = createSharedSecretService({
    sharedSecretRepository: repository,
    unitOfWork: createInMemorySecretSharingUnitOfWork({ sharedSecrets: repository }),
    kmsCore: createFakeKmsCoreService()
  });
  return { rows, sharedSecretService };
};

describe("sharedSecretService (functional)", () => {
  test("creates a shared secret and returns its value on view", async () => {
    const { sharedSecretService } = setup();

    const created = await sharedSecretService.createSharedSecret(creator, {
      value: "db-password",
      expiresAt: inOneHour(),
      maxViews: 2
    });
    const viewed = await sharedSecretService.viewSharedSecret(created.id);

    expect(viewed.value).toBe("db-password");
    expect(viewed.sharedSecret.remainingViews).toBe(1);
  });

  test("refuses a view after the view limit", async () => {
    const { sharedSecretService } = setup();
    const created = await sharedSecretService.createSharedSecret(creator, {
      value: "once",
      expiresAt: inOneHour(),
      maxViews: 1
    });

    await sharedSecretService.viewSharedSecret(created.id);

    await expect(sharedSecretService.viewSharedSecret(created.id)).rejects.toThrow(/view limit/);
  });

  test("refuses a view after expiry", async () => {
    const { rows, sharedSecretService } = setup();
    const created = await sharedSecretService.createSharedSecret(creator, { value: "x", expiresAt: inOneHour() });
    rows.set(created.id, { ...rows.get(created.id)!, expiresAt: new Date(Date.now() - 1000) });

    await expect(sharedSecretService.viewSharedSecret(created.id)).rejects.toThrow(/expired/);
  });

  test("refuses an expiry in the past", async () => {
    const { sharedSecretService } = setup();

    await expect(
      sharedSecretService.createSharedSecret(creator, { value: "x", expiresAt: new Date(Date.now() - 1000) })
    ).rejects.toThrow(/in the future/);
  });

  test("only the creator can delete", async () => {
    const { rows, sharedSecretService } = setup();
    const created = await sharedSecretService.createSharedSecret(creator, { value: "x", expiresAt: inOneHour() });

    await expect(
      sharedSecretService.deleteSharedSecret({ type: "user", id: "user-2", orgId: "org-1" }, created.id)
    ).rejects.toThrow(/Only the creator/);

    await sharedSecretService.deleteSharedSecret(creator, created.id);
    expect(rows.size).toBe(0);
  });
});
