import { randomUUID } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { CapacityExceededError } from "@app/domains/lib/errors";
import { TTransaction } from "@app/domains/lib/transactions";

import { TCipherPair } from "../../models/data-key";
import { KmsDataKey, TKmsDataKeyService } from "../data-key/service";
import {
  createSecretDecryptLease,
  createSecretDecryptReservations,
  getInFlightSecretDecrypts,
  releaseSecretDecryptLease,
  SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG,
  TSecretDecryptLease,
  withSecretDecryptLimit
} from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const cipherPair: TCipherPair = {
  encryptor: ({ plainText }) => ({ cipherTextBlob: Buffer.from(plainText) }),
  decryptor: ({ cipherTextBlob }) => Buffer.from(cipherTextBlob),
  generateSecretBlindIndex: async () => "blind-index"
};
const createCipherPairWithDataKey = async () => cipherPair;
const kmsDataKeyService = {
  createCipherPairWithDataKey,
  within: () => ({ createCipherPairWithDataKey })
} as unknown as TKmsDataKeyService;

const blob = { cipherTextBlob: Buffer.from("value") };
const projectKey = { type: KmsDataKey.SecretManager, projectId: "project-1" } as const;

const setup = () => {
  const orgId = `org-${randomUUID()}`;
  let current: TSecretDecryptLease | undefined;
  const dataKeys = withSecretDecryptLimit(kmsDataKeyService, () => current);
  const reservations = createSecretDecryptReservations(() => current);

  const startRequest = (requestOrgId = orgId) => {
    current = { ...createSecretDecryptLease(), orgId: requestOrgId };
    return current;
  };
  const leaveRequest = () => {
    current = undefined;
  };
  const decryptTimes = async (count: number) => {
    const { decryptor } = await dataKeys.createCipherPairWithDataKey(projectKey);
    for (let i = 0; i < count; i += 1) decryptor(blob);
  };

  return { orgId, dataKeys, reservations, startRequest, leaveRequest, decryptTimes };
};

describe("withSecretDecryptLimit", () => {
  test("should hold one entry per decrypt and still return the plaintext", async () => {
    // Setup
    const { orgId, dataKeys, startRequest } = setup();
    startRequest();
    const { decryptor } = await dataKeys.createCipherPairWithDataKey(projectKey);

    // Action
    const plaintext = decryptor(blob);
    decryptor(blob);
    decryptor(blob);

    // Assert
    expect(plaintext.toString()).toBe("value");
    expect(getInFlightSecretDecrypts(orgId)).toBe(3);
  });

  test("should refuse a request while the organization's other requests hold the limit", async () => {
    // Setup
    const { orgId, dataKeys, startRequest, decryptTimes } = setup();
    startRequest();
    await decryptTimes(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest();

    // Action
    const result = dataKeys.createCipherPairWithDataKey(projectKey);

    // Assert
    await expect(result).rejects.toBeInstanceOf(CapacityExceededError);
    await expect(result).rejects.toThrow("Too many secrets are being decrypted for this organization right now");
    expect(getInFlightSecretDecrypts(orgId)).toBe(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
  });

  test("should admit the organization again once the holding request is released", async () => {
    // Setup
    const { dataKeys, startRequest, decryptTimes } = setup();
    const holder = startRequest();
    await decryptTimes(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest();
    releaseSecretDecryptLease(holder);

    // Action
    const result = dataKeys.createCipherPairWithDataKey(projectKey);

    // Assert
    await expect(result).resolves.toBeDefined();
  });

  test("should not refuse a request because of its own entries", async () => {
    // Setup
    const { dataKeys, startRequest, decryptTimes } = setup();
    startRequest();
    await decryptTimes(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG + 50);

    // Action
    const result = dataKeys.createCipherPairWithDataKey(projectKey);

    // Assert
    await expect(result).resolves.toBeDefined();
  });

  test("should not count one organization's entries against another", async () => {
    // Setup
    const { dataKeys, startRequest, decryptTimes } = setup();
    startRequest();
    await decryptTimes(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest(`org-${randomUUID()}`);

    // Action
    const result = dataKeys.createCipherPairWithDataKey(projectKey);

    // Assert
    await expect(result).resolves.toBeDefined();
  });

  test("should count decrypts made inside a transaction", async () => {
    // Setup
    const { orgId, dataKeys, startRequest } = setup();
    startRequest();
    const { decryptor } = await dataKeys.within({} as TTransaction).createCipherPairWithDataKey(projectKey);

    // Action
    decryptor(blob);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(1);
  });

  test("should not count decrypts with an organization data key", async () => {
    // Setup
    const { orgId, dataKeys, startRequest } = setup();
    const lease = startRequest();
    const { decryptor } = await dataKeys.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });

    // Action
    decryptor(blob);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(0);
    expect(lease.held).toBe(0);
  });

  test("should not count work outside a request", async () => {
    // Setup
    const { orgId, dataKeys, startRequest, decryptTimes, leaveRequest } = setup();
    startRequest();
    await decryptTimes(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    leaveRequest();

    // Action
    const { decryptor } = await dataKeys.createCipherPairWithDataKey(projectKey);
    decryptor(blob);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
  });

  test("should not count a request that has no organization", async () => {
    // Setup
    const lease = createSecretDecryptLease();
    const dataKeys = withSecretDecryptLimit(kmsDataKeyService, () => lease);
    const { decryptor } = await dataKeys.createCipherPairWithDataKey(projectKey);

    // Action
    decryptor(blob);

    // Assert
    expect(lease.held).toBe(0);
  });
});

describe("createSecretDecryptReservations", () => {
  test("should hold reserved secrets before the request decrypts any of them", () => {
    // Setup
    const { orgId, reservations, startRequest } = setup();
    startRequest();

    // Action
    reservations.reserveDecrypts(5);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(5);
  });

  test("should not count a decrypt twice when a reservation already holds it", async () => {
    // Setup
    const { orgId, reservations, startRequest, decryptTimes } = setup();
    startRequest();
    reservations.reserveDecrypts(2);

    // Action
    await decryptTimes(3);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(3);
  });

  test("should refuse a reservation while the organization's other requests hold the limit", () => {
    // Setup
    const { orgId, reservations, startRequest } = setup();
    startRequest();
    reservations.reserveDecrypts(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest();

    // Action
    const reserve = () => reservations.reserveDecrypts(1);

    // Assert
    expect(reserve).toThrow(CapacityExceededError);
    expect(reserve).toThrow("Too many secrets are being decrypted for this organization right now");
    expect(getInFlightSecretDecrypts(orgId)).toBe(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
  });

  test("should refuse other requests when the cipher is handed out once a reservation holds the limit", async () => {
    // Setup
    const { dataKeys, reservations, startRequest } = setup();
    startRequest();
    reservations.reserveDecrypts(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest();

    // Action
    const result = dataKeys.createCipherPairWithDataKey(projectKey);

    // Assert
    await expect(result).rejects.toBeInstanceOf(CapacityExceededError);
  });

  test("should let a single read reserve more than the limit", () => {
    // Setup
    const { orgId, reservations, startRequest } = setup();
    startRequest();
    reservations.reserveDecrypts(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);

    // Action
    reservations.reserveDecrypts(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG * 9);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG * 10);
  });

  test("should not refuse an empty read even while the organization's other requests hold the limit", () => {
    // Setup
    const { orgId, reservations, startRequest } = setup();
    startRequest();
    reservations.reserveDecrypts(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest();

    // Action
    const reserve = () => reservations.reserveDecrypts(0);

    // Assert
    expect(reserve).not.toThrow();
    expect(getInFlightSecretDecrypts(orgId)).toBe(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
  });

  test("should not count one organization's reservation against another", () => {
    // Setup
    const { reservations, startRequest } = setup();
    startRequest();
    reservations.reserveDecrypts(SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG);
    startRequest(`org-${randomUUID()}`);

    // Action
    const reserve = () => reservations.reserveDecrypts(1);

    // Assert
    expect(reserve).not.toThrow();
  });

  test("should not reserve for work outside a request", () => {
    // Setup
    const { orgId, reservations } = setup();

    // Action
    reservations.reserveDecrypts(5);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(0);
  });

  test("should not reserve for a request that has no organization", () => {
    // Setup
    const lease = createSecretDecryptLease();
    const reservations = createSecretDecryptReservations(() => lease);

    // Action
    reservations.reserveDecrypts(5);

    // Assert
    expect(lease.held).toBe(0);
  });
});

describe("releaseSecretDecryptLease", () => {
  test("should give back reserved secrets the request never decrypted", async () => {
    // Setup
    const { orgId, reservations, startRequest, decryptTimes } = setup();
    const lease = startRequest();
    reservations.reserveDecrypts(5);
    await decryptTimes(2);

    // Action
    releaseSecretDecryptLease(lease);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(0);
  });

  test("should give back a request's entries once, leaving other requests' entries held", async () => {
    // Setup
    const { orgId, startRequest, decryptTimes } = setup();
    const first = startRequest();
    await decryptTimes(2);
    startRequest();
    await decryptTimes(3);

    // Action
    releaseSecretDecryptLease(first);
    releaseSecretDecryptLease(first);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(3);
  });

  test("should stop counting decrypts a released request still makes", async () => {
    // Setup
    const { orgId, dataKeys, startRequest } = setup();
    const lease = startRequest();
    const { decryptor } = await dataKeys.createCipherPairWithDataKey(projectKey);
    decryptor(blob);
    releaseSecretDecryptLease(lease);

    // Action
    decryptor(blob);

    // Assert
    expect(getInFlightSecretDecrypts(orgId)).toBe(0);
  });
});
