import { KMSServiceException } from "@aws-sdk/client-kms";
import { STSServiceException } from "@aws-sdk/client-sts";
import slugify from "@sindresorhus/slugify";

import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsAwsSchema,
  TExternalKmsGcpSchema,
  TExternalKmsInputSchema,
  TExternalKmsInputUpdateSchema
} from "@app/ee/services/external-kms/providers/model";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TKmsCoreDataAccess } from "../../ce/data-access/kms-core-data-access";
import { KmsKey } from "../../ce/model/kms-key";
import {
  TCreateExternalKmsInput,
  TExternalKeyRef,
  TExternalKmsDetails,
  TExternalKmsSummary,
  TUpdateExternalKmsInput
} from "../../ce/service/kms-core-hooks";
import { TCipherPair } from "../../ce/service/kms-core-types";
import { TExternalKmsProviders } from "../external-kms-client/external-kms-providers";

type TProviderInput = TExternalKmsAwsSchema | TExternalKmsGcpSchema;

export type TExternalKmsServiceDeps = {
  transactionRunner: TTransactionRunner<TKmsCoreDataAccess>;
  dataAccess: TKmsCoreDataAccess;
  providers: TExternalKmsProviders;
};

const notFound = (kmsId: string) => new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });

const providerError = (provider: string, error: unknown, fallback: string) => {
  if (error instanceof BadRequestError) return error;
  return new BadRequestError({ message: error instanceof Error ? `${provider} error: ${error.message}` : fallback });
};

// External KMS keys: provider inputs are validated against the provider before anything is stored, and encrypted
// with the org data-key cipher the community module hands in. No permission or plan checks: the caller owns those.
export class ExternalKmsService {
  constructor(private readonly deps: TExternalKmsServiceDeps) {}

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
      name: name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase()),
      description,
      provider: provider.type,
      encryptedProviderInputs: cipherTextBlob
    });
    const created = await this.deps.transactionRunner.run(({ dataAccess }) => dataAccess.kmsKeys.create(key));
    return ExternalKmsService.details(created, providerInput);
  }

  async update({ kmsId, name, description, provider }: TUpdateExternalKmsInput, orgCipher: TCipherPair) {
    const key = await this.requireExternal(kmsId);
    let providerInput = ExternalKmsService.openInputs(key, orgCipher);
    let encryptedProviderInputs: Buffer | undefined;
    if (provider) {
      providerInput = await this.validateUpdate(provider as TExternalKmsInputUpdateSchema, providerInput);
      encryptedProviderInputs = orgCipher.encryptor({
        plainText: Buffer.from(JSON.stringify(providerInput))
      }).cipherTextBlob;
    }

    const updated = await this.deps.transactionRunner.run(async ({ dataAccess }) => {
      const current = await dataAccess.kmsKeys.findById(kmsId);
      if (!current?.isExternal) throw notFound(kmsId);
      if (name || description) {
        current.updateAttributes({ name: name ? slugify(name) : undefined, description });
        await dataAccess.kmsKeys.saveAttributes(current);
      }
      if (encryptedProviderInputs) {
        current.updateExternalConfig(encryptedProviderInputs);
        await dataAccess.kmsKeys.saveExternalConfig(current);
      }
      return (await dataAccess.kmsKeys.findById(kmsId)) as KmsKey;
    });
    return ExternalKmsService.details(updated, providerInput);
  }

  async delete(kmsId: string, orgCipher: TCipherPair) {
    const key = await this.requireExternal(kmsId);
    const providerInput = ExternalKmsService.openInputs(key, orgCipher);
    await this.deps.transactionRunner.run(({ dataAccess }) => dataAccess.kmsKeys.deleteById(kmsId));
    return ExternalKmsService.details(key, providerInput);
  }

  async get(kmsId: string, orgCipher: TCipherPair) {
    const key = await this.requireExternal(kmsId);
    return ExternalKmsService.details(key, ExternalKmsService.openInputs(key, orgCipher));
  }

  async list(orgId: string): Promise<TExternalKmsSummary[]> {
    const keys = await this.deps.dataAccess.kmsKeys.find({ orgId });
    return keys
      .filter((key) => key.isExternal)
      .map((key) => {
        const external = key.external as NonNullable<KmsKey["external"]>;
        return {
          ...key.toRecord(),
          externalKms: {
            id: external.id,
            provider: external.provider,
            status: external.status,
            statusDetails: external.statusDetails
          }
        };
      });
  }

  async fetchGcpKeys({
    credential,
    gcpRegion
  }: {
    credential: unknown;
    gcpRegion: string;
  }): Promise<{ keys: string[] }> {
    const client = await this.deps.providers.gcp({
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

  private async requireExternal(kmsId: string) {
    const key = await this.deps.dataAccess.kmsKeys.findById(kmsId);
    if (!key?.isExternal) throw notFound(kmsId);
    return key;
  }

  private static openInputs(key: KmsKey, orgCipher: TCipherPair): TProviderInput {
    const external = key.external as NonNullable<KmsKey["external"]>;
    const raw = JSON.parse(
      orgCipher.decryptor({ cipherTextBlob: external.encryptedProviderInputs }).toString("utf8")
    ) as unknown;
    switch (external.provider) {
      case KmsProviders.Aws:
        return ExternalKmsAwsSchema.parse(raw);
      case KmsProviders.Gcp:
        return ExternalKmsGcpSchema.parse(raw);
      default:
        throw new BadRequestError({ message: "Invalid KMS provider." });
    }
  }

  private async client(ref: TExternalKeyRef, orgCipher: TCipherPair) {
    const raw = JSON.parse(
      orgCipher.decryptor({ cipherTextBlob: ref.encryptedProviderInputs }).toString("utf8")
    ) as unknown;
    switch (ref.provider) {
      case KmsProviders.Aws:
        return this.deps.providers.aws({ inputs: await ExternalKmsAwsSchema.parseAsync(raw) });
      case KmsProviders.Gcp:
        return this.deps.providers.gcp({ inputs: await ExternalKmsGcpSchema.parseAsync(raw) });
      default:
        throw new BadRequestError({ message: "Invalid KMS provider." });
    }
  }

  // Validates against the provider before anything is stored. AWS may create a key and return its id in the inputs.
  private async validateNew(provider: TExternalKmsInputSchema): Promise<TProviderInput> {
    switch (provider.type) {
      case KmsProviders.Aws: {
        const client = await this.deps.providers.aws({ inputs: provider.inputs }).catch((error) => {
          if (error instanceof STSServiceException || error instanceof KMSServiceException) {
            throw new InternalServerError({ message: error.message ? `AWS error: ${error.message}` : "" });
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
        const client = await this.deps.providers.gcp({ inputs: provider.inputs });
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
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }
  }

  private async validateUpdate(
    provider: TExternalKmsInputUpdateSchema,
    current: TProviderInput
  ): Promise<TProviderInput> {
    switch (provider.type) {
      case KmsProviders.Aws: {
        const inputs = { ...ExternalKmsAwsSchema.parse(current), ...provider.inputs };
        const client = await this.deps.providers.aws({ inputs });
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
        const client = await this.deps.providers.gcp({ inputs });
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
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }
  }

  private static details(key: KmsKey, providerInput: TProviderInput): TExternalKmsDetails {
    const external = key.external as NonNullable<KmsKey["external"]>;
    return {
      ...key.toRecord(),
      external: {
        id: external.id,
        kmsKeyId: key.id,
        provider: external.provider,
        status: external.status,
        statusDetails: external.statusDetails,
        providerInput: providerInput as unknown as Record<string, unknown>
      }
    };
  }
}
