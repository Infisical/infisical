import { CapacityExceededError } from "@app/domains/lib/errors";
import { createKeyedInFlightCounter } from "@app/lib/concurrency/concurrency-limiter";
import { logger } from "@app/lib/logger";

import { TCipherPair } from "../../models/data-key";
import { KmsDataKey, TEncryptWithKmsDataKeyDTO, TKmsDataKeyService } from "../data-key/service";

export const SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG = 1000;
const SATURATION_LOG_INTERVAL_MS = 10_000;

export type TSecretDecryptLease = {
  orgId?: string;
  held: number;
  reservedUndecrypted: number;
  released: boolean;
};

export type TCurrentSecretDecryptLease = () => TSecretDecryptLease | undefined;

export type TSecretDecryptReservations = {
  reserveDecrypts: (count: number) => void;
};

type TAdmittedLease = TSecretDecryptLease & { orgId: string };

const inFlightDecrypts = createKeyedInFlightCounter();
let lastSaturationLogAt = 0;

export const getInFlightSecretDecrypts = (orgId: string) => inFlightDecrypts.get(orgId);

export const createSecretDecryptLease = (): TSecretDecryptLease => ({
  held: 0,
  reservedUndecrypted: 0,
  released: false
});

export const releaseSecretDecryptLease = (lease: TSecretDecryptLease | undefined) => {
  if (!lease || lease.released) return;
  // eslint-disable-next-line no-param-reassign -- marks the request's lease as spent
  lease.released = true;
  if (lease.orgId && lease.held > 0) inFlightDecrypts.remove(lease.orgId, lease.held);
};

const activeLease = (lease: TSecretDecryptLease | undefined): TAdmittedLease | undefined => {
  if (!lease || lease.released || !lease.orgId) return undefined;
  return lease as TAdmittedLease;
};

const refuseWhileOthersHoldLimit = (lease: TAdmittedLease) => {
  const heldByOtherRequests = inFlightDecrypts.get(lease.orgId) - lease.held;
  if (heldByOtherRequests < SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG) return;

  if (Date.now() - lastSaturationLogAt > SATURATION_LOG_INTERVAL_MS) {
    lastSaturationLogAt = Date.now();
    logger.warn(
      `Secret decrypt limit reached, shedding request [orgId=${lease.orgId}] [inFlightDecrypts=${heldByOtherRequests}] [limit=${SECRET_DECRYPT_MAX_IN_FLIGHT_PER_ORG}]`
    );
  }
  throw new CapacityExceededError({
    message: "Too many secrets are being decrypted for this organization right now. Retry the request in a few seconds."
  });
};

const admit = (
  context: TEncryptWithKmsDataKeyDTO,
  lease: TSecretDecryptLease | undefined
): TAdmittedLease | undefined => {
  if (context.type !== KmsDataKey.SecretManager) return undefined;
  const admitted = activeLease(lease);
  if (!admitted) return undefined;

  refuseWhileOthersHoldLimit(admitted);
  return admitted;
};

const countDecrypts = (cipherPair: TCipherPair, lease: TAdmittedLease | undefined): TCipherPair => {
  if (!lease) return cipherPair;

  return {
    ...cipherPair,
    decryptor: (input) => {
      if (!lease.released) {
        if (lease.reservedUndecrypted > 0) {
          // eslint-disable-next-line no-param-reassign -- a reserved decrypt is already held
          lease.reservedUndecrypted -= 1;
        } else {
          inFlightDecrypts.add(lease.orgId);
          // eslint-disable-next-line no-param-reassign -- the lease is the request's running total
          lease.held += 1;
        }
      }
      return cipherPair.decryptor(input);
    }
  };
};

export const withSecretDecryptLimit = (
  kmsDataKeyService: TKmsDataKeyService,
  currentLease: TCurrentSecretDecryptLease
): TKmsDataKeyService => ({
  createCipherPairWithDataKey: async (context, options) => {
    const lease = admit(context, currentLease());
    return countDecrypts(await kmsDataKeyService.createCipherPairWithDataKey(context, options), lease);
  },
  within: (tx) => {
    const joined = kmsDataKeyService.within(tx);
    return {
      createCipherPairWithDataKey: async (context) => {
        const lease = admit(context, currentLease());
        return countDecrypts(await joined.createCipherPairWithDataKey(context), lease);
      },
      getProjectSecretManagerKmsKeyId: (projectId) => joined.getProjectSecretManagerKmsKeyId(projectId),
      getProjectCertificateKmsKeyId: (projectId) => joined.getProjectCertificateKmsKeyId(projectId),
      deleteProjectKeys: (input) => joined.deleteProjectKeys(input)
    };
  },
  getProjectSecretManagerKmsKeyId: (projectId) => kmsDataKeyService.getProjectSecretManagerKmsKeyId(projectId),
  getProjectCertificateKmsKeyId: (projectId) => kmsDataKeyService.getProjectCertificateKmsKeyId(projectId),
  wrapKey: (input) => kmsDataKeyService.wrapKey(input),
  unwrapKey: (input) => kmsDataKeyService.unwrapKey(input),
  updateProjectSecretManagerKmsKey: (input) => kmsDataKeyService.updateProjectSecretManagerKmsKey(input),
  getProjectKeyBackup: (projectId) => kmsDataKeyService.getProjectKeyBackup(projectId),
  loadProjectKeyBackup: (projectId, backup) => kmsDataKeyService.loadProjectKeyBackup(projectId, backup),
  deleteProjectKeys: (input) => kmsDataKeyService.deleteProjectKeys(input)
});

export const createSecretDecryptReservations = (
  currentLease: TCurrentSecretDecryptLease
): TSecretDecryptReservations => ({
  reserveDecrypts: (count) => {
    const lease = activeLease(currentLease());
    if (!lease || count <= 0) return;

    refuseWhileOthersHoldLimit(lease);
    inFlightDecrypts.add(lease.orgId, count);
    lease.held += count;
    lease.reservedUndecrypted += count;
  }
});
