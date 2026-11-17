import { KmsDataKey, TCipherPair, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";

export type TSecretValueBlindIndexes = {
  secretValueBlindIndex: string;
  secretValueOrgBlindIndex: string;
};

export type TSecretBlindIndexer = {
  generateProjectLevelBlindIndex: (secretValue: Buffer) => Promise<string>;
  generateOrgLevelBlindIndex: (secretValue: Buffer) => Promise<string>;
  generateBlindIndexes: (secretValue: Buffer) => Promise<TSecretValueBlindIndexes>;
};

export type TCreateOrgSecretBlindIndexerDTO = {
  orgId: string;
  kmsDataKeyService: TKmsDataKeyService;
};

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
