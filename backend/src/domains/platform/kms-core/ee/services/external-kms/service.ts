import { KMSServiceException } from "@aws-sdk/client-kms";
import { STSServiceException } from "@aws-sdk/client-sts";

import { RuleViolationError, ExternalSystemError, EntityNotFoundError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsAwsSchema,
  TExternalKmsGcpSchema,
  TExternalKmsInputSchema,
  TExternalKmsInputUpdateSchema
} from "@app/ee/services/external-kms/providers/model";

import { TCipherPair } from "../../../ce/models/data-key";
import { TExternalKeyRef } from "../../../ce/models/external-key-config";
import { KmsKey } from "../../../ce/models/kms-key";
import {
  TCreateExternalKmsInput,
  TExternalKmsDetails,
  TExternalKmsHook,
  TExternalKmsSummary,
  TKmsCoreStores,
  TUpdateExternalKmsInput
} from "../../../ce/services/dependencies";
import { TExternalKmsProviders } from "../dependencies";

type TProviderInput = TExternalKmsAwsSchema | TExternalKmsGcpSchema;

type TOpenedInputs =
  | { type: KmsProviders.Aws; inputs: TExternalKmsAwsSchema }
  | { type: KmsProviders.Gcp; inputs: TExternalKmsGcpSchema };

const notFound = (kmsId: string) => new EntityNotFoundError({ message: `External KMS with ID '${kmsId}' not found` });

const providerError = (provider: string, error: unknown, fallback: string) => {
  if (error instanceof RuleViolationError) return error;
  return new RuleViolationError({ message: error instanceof Error ? `${provider} error: ${error.message}` : fallback });
};

// External KMS keys: provider inputs are validated against the provider before anything is stored, and encrypted
// with the org data-key cipher the community module hands in. No permission or plan checks: the caller owns those.
export class ExternalKmsService implements TExternalKmsHook {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly stores: TKmsCoreStores,
    private readonly providers: TExternalKmsProviders
  ) {}

  async encrypt(ref: TExternalKeyRef, orgCipher: TCipherPair, plainText: Buffer): Promise<Buffer<ArrayBuffer>> {
    const client = await this.client(ref, orgCipher);
    try {
      return (await client.encrypt(plainText)).encryptedBlob;
    } finally {
      await client.cleanup();
    }
  }

  async decrypt(ref: TExternalKeyRef, orgCipher: TCipherPair, cipherTextBlob: Buffer): Promise<Buffer<ArrayBuffer>> {
    const client = await this.client(ref, orgCipher);
    try {
      return (await client.decrypt(cipherTextBlob)).data;
    } finally {
      await client.cleanup();
    }
  }

  async create({ orgId, name, description, provider }: TCreateExternalKmsInput, orgCipher: TCipherPair) {
    const providerInput = await this.validateNew(provider as TExternalKmsInputSchema);
    const { cipherTextBlob } = orgCipher.encryptor({ plainText: Buffer.from(JSON.stringify(providerInput)) });
    const key = KmsKey.createExternal({
      orgId,
      name,
      description,
      provider: provider.type,
      encryptedProviderInputs: cipherTextBlob
    });
    await this.transactionRunner.run(({ stores }) => stores.kmsKeyStore.insert(key));
    return ExternalKmsService.details(key, providerInput);
  }

  async update(key: KmsKey, { name, description, provider }: TUpdateExternalKmsInput, orgCipher: TCipherPair) {
    let providerInput = ExternalKmsService.openInputs(key, orgCipher).inputs;
    let encryptedProviderInputs: Buffer | undefined;
    if (provider) {
      providerInput = await this.validateUpdate(provider as TExternalKmsInputUpdateSchema, providerInput);
      encryptedProviderInputs = orgCipher.encryptor({
        plainText: Buffer.from(JSON.stringify(providerInput))
      }).cipherTextBlob;
    }

    const updated = await this.transactionRunner.run(async ({ stores }) => {
      const current = await stores.kmsKeyStore.findForUpdate(key.id);
      if (!current?.isExternal) throw notFound(key.id);
      if (name) current.rename(name);
      if ((name || description) && description !== undefined) current.describe(description);
      if (encryptedProviderInputs) current.replaceProviderInputs(encryptedProviderInputs);
      await stores.kmsKeyStore.save(current);
      return current;
    });
    return ExternalKmsService.details(updated, providerInput);
  }

  async delete(key: KmsKey, orgCipher: TCipherPair) {
    const providerInput = ExternalKmsService.openInputs(key, orgCipher).inputs;
    await this.transactionRunner.run(({ stores }) => stores.kmsKeyStore.delete(key.id));
    return ExternalKmsService.details(key, providerInput);
  }

  // eslint-disable-next-line class-methods-use-this
  async get(key: KmsKey, orgCipher: TCipherPair) {
    return ExternalKmsService.details(key, ExternalKmsService.openInputs(key, orgCipher).inputs);
  }

  async list(orgId: string): Promise<TExternalKmsSummary[]> {
    const keys = await this.stores.kmsKeyStore.find({ orgId, isExternal: true });
    return keys.map((key) => ({ ...key.columns(), externalKms: ExternalKmsService.statusOf(key) }));
  }

  async fetchGcpKeys({
    credential,
    gcpRegion
  }: {
    credential: unknown;
    gcpRegion: string;
  }): Promise<{ keys: string[] }> {
    const client = await this.providers.gcp({
      inputs: { credential: credential as TExternalKmsGcpSchema["credential"], gcpRegion, keyName: "" }
    });
    try {
      return await client.getKeysList();
    } catch (error) {
      throw providerError("GCP", error, "Failed to fetch GCP keys");
    } finally {
      await client.cleanup();
    }
  }

  private static refOf(key: KmsKey): TExternalKeyRef {
    const ref = key.externalRef();
    if (!ref) throw notFound(key.id);
    return ref;
  }

  private static statusOf(key: KmsKey) {
    const status = key.externalStatus();
    if (!status) throw notFound(key.id);
    return status;
  }

  private static openInputs(key: KmsKey | TExternalKeyRef, orgCipher: TCipherPair): TOpenedInputs {
    const ref = key instanceof KmsKey ? ExternalKmsService.refOf(key) : key;
    const raw = JSON.parse(
      orgCipher.decryptor({ cipherTextBlob: ref.encryptedProviderInputs }).toString("utf8")
    ) as unknown;
    switch (ref.provider) {
      case KmsProviders.Aws:
        return { type: KmsProviders.Aws, inputs: ExternalKmsAwsSchema.parse(raw) };
      case KmsProviders.Gcp:
        return { type: KmsProviders.Gcp, inputs: ExternalKmsGcpSchema.parse(raw) };
      default:
        throw new RuleViolationError({ message: "Invalid KMS provider." });
    }
  }

  private client(ref: TExternalKeyRef, orgCipher: TCipherPair) {
    const opened = ExternalKmsService.openInputs(ref, orgCipher);
    return opened.type === KmsProviders.Aws
      ? this.providers.aws({ inputs: opened.inputs })
      : this.providers.gcp({ inputs: opened.inputs });
  }

  // Validates against the provider before anything is stored. AWS may create a key and return its id in the inputs.
  private async validateNew(provider: TExternalKmsInputSchema): Promise<TProviderInput> {
    switch (provider.type) {
      case KmsProviders.Aws: {
        const client = await this.providers.aws({ inputs: provider.inputs }).catch((error) => {
          if (error instanceof STSServiceException || error instanceof KMSServiceException) {
            throw new ExternalSystemError({
              message: error.message ? `AWS error: ${error.message}` : "Failed to connect to AWS KMS"
            });
          }
          throw error;
        });
        try {
          const inputs = await client.generateInputKmsKey();
          await client.validateConnection();
          return inputs;
        } catch (error) {
          throw providerError("AWS", error, "Failed to validate AWS connection");
        } finally {
          await client.cleanup();
        }
      }
      case KmsProviders.Gcp: {
        const client = await this.providers.gcp({ inputs: provider.inputs });
        try {
          await client.validateConnection();
          return provider.inputs;
        } catch (error) {
          throw providerError("GCP", error, "Failed to validate GCP connection");
        } finally {
          await client.cleanup();
        }
      }
      default:
        throw new RuleViolationError({ message: "external kms provided is invalid" });
    }
  }

  private async validateUpdate(
    provider: TExternalKmsInputUpdateSchema,
    current: TProviderInput
  ): Promise<TProviderInput> {
    switch (provider.type) {
      case KmsProviders.Aws: {
        const inputs = { ...ExternalKmsAwsSchema.parse(current), ...provider.inputs };
        const client = await this.providers.aws({ inputs });
        try {
          await client.validateConnection();
          return inputs;
        } catch (error) {
          throw providerError("AWS", error, "Failed to validate AWS connection");
        } finally {
          await client.cleanup();
        }
      }
      case KmsProviders.Gcp: {
        const inputs = { ...ExternalKmsGcpSchema.parse(current), ...provider.inputs };
        const client = await this.providers.gcp({ inputs });
        try {
          await client.validateConnection();
          return inputs;
        } catch (error) {
          throw providerError("GCP", error, "Failed to validate GCP connection");
        } finally {
          await client.cleanup();
        }
      }
      default:
        throw new RuleViolationError({ message: "external kms provided is invalid" });
    }
  }

  private static details(key: KmsKey, providerInput: TProviderInput): TExternalKmsDetails {
    return {
      ...key.columns(),
      external: {
        ...ExternalKmsService.statusOf(key),
        kmsKeyId: key.id,
        providerInput: providerInput as unknown as Record<string, unknown>
      }
    };
  }
}
