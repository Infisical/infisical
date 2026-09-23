import { Knex } from "knex";

import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";

export type TSecretValueBlindIndexes = {
  secretValueBlindIndex: string;
  secretValueOrgBlindIndex: string | null;
};

export type TSecretBlindIndexer = {
  generate: (secretValue: Buffer) => Promise<TSecretValueBlindIndexes>;
  generateOptional: (secretValue?: string | null) => Promise<TSecretValueBlindIndexes | null>;
};

export type TCreateSecretBlindIndexerDTO = {
  projectId: string;
  orgId: string;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  tx?: Knex;
};

// Build one of these per request and reuse it for every secret in that request. A bulk write can
// carry thousands of values, and resolving a data key per value would hit an external KMS that many
// times.
export const createSecretBlindIndexer = async ({
  projectId,
  orgId,
  kmsService,
  orgDAL,
  tx
}: TCreateSecretBlindIndexerDTO): Promise<TSecretBlindIndexer> => {
  const [projectCipher, org] = await Promise.all([
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, tx),
    orgDAL.findById(orgId, tx)
  ]);

  const orgCipher = org?.secretValueOrgBlindIndexEnabled
    ? await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId }, tx)
    : null;

  const generate = async (secretValue: Buffer): Promise<TSecretValueBlindIndexes> => {
    const [secretValueBlindIndex, secretValueOrgBlindIndex] = await Promise.all([
      projectCipher.generateSecretBlindIndex(secretValue),
      orgCipher ? orgCipher.generateSecretBlindIndex(secretValue) : Promise.resolve(null)
    ]);

    return { secretValueBlindIndex, secretValueOrgBlindIndex };
  };

  return {
    generate,
    generateOptional: async (secretValue?: string | null) =>
      secretValue === undefined || secretValue === null ? null : generate(Buffer.from(secretValue))
  };
};
