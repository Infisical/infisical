import { FakeKmsCoreService } from "@app/domains-poc/class/platform/kms-core/testing/fake-kms-core-service";

import { TSharedSecretActor } from "../model/shared-secret";
import { InMemorySecretSharingUnitOfWork } from "../testing/in-memory-secret-sharing-unit-of-work";
import { InMemorySharedSecretRepository } from "../testing/in-memory-shared-secret-repository";
import { SharedSecretService } from "./shared-secret-service";

const creator: TSharedSecretActor = { type: "user", id: "user-1", orgId: "org-1" };
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

const setup = () => {
  const sharedSecretRepository = new InMemorySharedSecretRepository();
  const sharedSecretService = new SharedSecretService({
    sharedSecretRepository,
    unitOfWork: new InMemorySecretSharingUnitOfWork({ sharedSecrets: sharedSecretRepository }),
    kmsCore: new FakeKmsCoreService()
  });
  return { sharedSecretRepository, sharedSecretService };
};

describe("SharedSecretService (class)", () => {
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
    const { sharedSecretRepository, sharedSecretService } = setup();
    const created = await sharedSecretService.createSharedSecret(creator, { value: "x", expiresAt: inOneHour() });
    sharedSecretRepository.rows.get(created.id)!.expiresAt = new Date(Date.now() - 1000);

    await expect(sharedSecretService.viewSharedSecret(created.id)).rejects.toThrow(/expired/);
  });

  test("refuses an expiry in the past", async () => {
    const { sharedSecretService } = setup();

    await expect(
      sharedSecretService.createSharedSecret(creator, { value: "x", expiresAt: new Date(Date.now() - 1000) })
    ).rejects.toThrow(/in the future/);
  });

  test("only the creator can delete", async () => {
    const { sharedSecretRepository, sharedSecretService } = setup();
    const created = await sharedSecretService.createSharedSecret(creator, { value: "x", expiresAt: inOneHour() });

    await expect(
      sharedSecretService.deleteSharedSecret({ type: "user", id: "user-2", orgId: "org-1" }, created.id)
    ).rejects.toThrow(/Only the creator/);

    await sharedSecretService.deleteSharedSecret(creator, created.id);
    expect(sharedSecretRepository.rows.size).toBe(0);
  });
});
