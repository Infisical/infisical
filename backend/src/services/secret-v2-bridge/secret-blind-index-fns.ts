import { KmsDataKey, TCipherPair, TDataKeyService } from "@app/domains/platform/kms-core/ce/module";

export type TSecretValueBlindIndexes = {
  secretValueBlindIndex: string;
  secretValueOrgBlindIndex: string;
};

export type TSecretBlindIndexer = {
  generateProjectLevelBlindIndex: (secretValue: Buffer) => Promise<string>;
  generateOrgLevelBlindIndex: (secretValue: Buffer) => Promise<string>;
  generateBlindIndexes: (secretValue: Buffer) => Promise<TSecretValueBlindIndexes>;
};

export type TCreateSecretBlindIndexerDTO = {
  // The project's SecretManager cipher pair the caller already holds, so it is not resolved a second time.
  projectCipher: TCipherPair;
  orgId: string;
  kmsDataKeyService: TDataKeyService;
};

export type TCreateOrgSecretBlindIndexerDTO = Omit<TCreateSecretBlindIndexerDTO, "projectCipher">;

// Searching an org by value needs the org digest alone, so this resolves only the org data key
// rather than paying for a project key it would never use.
export const createOrgSecretBlindIndexer = async ({ orgId, kmsDataKeyService }: TCreateOrgSecretBlindIndexerDTO) => {
  const orgCipher = await kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });

  return {
    generateOrgLevelBlindIndex: (secretValue: Buffer) => orgCipher.generateSecretBlindIndex(secretValue)
  };
};

export const buildSecretBlindIndexer = (projectCipher: TCipherPair, orgCipher: TCipherPair): TSecretBlindIndexer => {
  const generateProjectLevelBlindIndex = (secretValue: Buffer) => projectCipher.generateSecretBlindIndex(secretValue);
  const generateOrgLevelBlindIndex = (secretValue: Buffer) => orgCipher.generateSecretBlindIndex(secretValue);

  return {
    generateProjectLevelBlindIndex,
    generateOrgLevelBlindIndex,
    generateBlindIndexes: async (secretValue: Buffer) => {
      const [secretValueBlindIndex, secretValueOrgBlindIndex] = await Promise.all([
        generateProjectLevelBlindIndex(secretValue),
        generateOrgLevelBlindIndex(secretValue)
      ]);

      return { secretValueBlindIndex, secretValueOrgBlindIndex };
    }
  };
};

// Build one of these per request and reuse it for every secret in that request. A bulk write can
// carry thousands of values, and resolving a data key per value would hit an external KMS that many
// times.
export const createSecretBlindIndexer = async ({
  projectCipher,
  orgId,
  kmsDataKeyService
}: TCreateSecretBlindIndexerDTO): Promise<TSecretBlindIndexer> => {
  const orgCipher = await kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
  return buildSecretBlindIndexer(projectCipher, orgCipher);
};
