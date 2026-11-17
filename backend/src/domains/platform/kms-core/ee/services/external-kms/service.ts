import { KMSServiceException } from "@aws-sdk/client-kms";
import { STSServiceException } from "@aws-sdk/client-sts";

import { RuleViolationError, ExternalSystemError, EntityNotFoundError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsGcpSchema,
  TExternalKmsInputSchema,
  TExternalKmsInputUpdateSchema
} from "@app/ee/services/external-kms/providers/model";

import { TCipherPair } from "../../../ce/models/data-key";
import { KmsKey } from "../../../ce/models/kms-key";
import { KmsDataKey, TKmsDataKeyService } from "../../../ce/services/data-key/service";
import {
  TCreateExternalKmsInput,
  TExternalKmsDetails,
  TExternalKmsService,
  TExternalKmsSummary,
  TKmsCoreStores,
  TUpdateExternalKmsInput
} from "../../../ce/services/dependencies";
import { TExternalKmsProviders } from "../dependencies";
import { openProviderInputs, providerError, TProviderInput } from "../helpers/provider-inputs";

const notFound = (kmsId: string) => new EntityNotFoundError({ message: `External KMS with ID '${kmsId}' not found` });

// Provider inputs are validated against the provider before anything is stored, and encrypted with the org data key,
// which is why this is built after KMS Core. No permission or plan checks: the caller owns those.
export class ExternalKmsService implements TExternalKmsService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly stores: TKmsCoreStores,
    private readonly providers: TExternalKmsProviders,
    private readonly kmsDataKeyService: TKmsDataKeyService
  ) {}

  async create({ orgId, name, description, provider }: TCreateExternalKmsInput) {
    const providerInput = await this.validateNew(provider as TExternalKmsInputSchema);
    const orgCipher = await this.orgCipher(orgId);
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

  async update(kmsId: string, { name, description, provider }: TUpdateExternalKmsInput) {
    const { key, orgCipher } = await this.requireExternal(kmsId);
    let providerInput = ExternalKmsService.openInputs(key, orgCipher);
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

  async delete(kmsId: string) {
    const { key, orgCipher } = await this.requireExternal(kmsId);
    const providerInput = ExternalKmsService.openInputs(key, orgCipher);
    await this.transactionRunner.run(({ stores }) => stores.kmsKeyStore.delete(key.id));
    return ExternalKmsService.details(key, providerInput);
  }

  async getById(kmsId: string) {
    const { key, orgCipher } = await this.requireExternal(kmsId);
    return ExternalKmsService.details(key, ExternalKmsService.openInputs(key, orgCipher));
  }

  async getByName(orgId: string, name: string) {
    const [key] = await this.stores.kmsKeyStore.find({ orgId, name });
    if (!key?.isExternal) throw new EntityNotFoundError({ message: `External KMS with name '${name}' not found` });
    const orgCipher = await this.orgCipher(orgId);
    return ExternalKmsService.details(key, ExternalKmsService.openInputs(key, orgCipher));
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
    return ExternalKmsService.withClient(client, "GCP", "Failed to fetch GCP keys", () => client.getKeysList());
  }

  private orgCipher(orgId: string): Promise<TCipherPair> {
    return this.kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
  }

  private async requireExternal(kmsId: string) {
    const key = await this.stores.kmsKeyStore.findById(kmsId);
    if (!key?.isExternal) throw notFound(kmsId);
    return { key, orgCipher: await this.orgCipher(key.orgId) };
  }

  // AWS may create a key and return its id in the inputs.
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
        return ExternalKmsService.withClient(client, "AWS", "Failed to validate AWS connection", async () => {
          const inputs = await client.generateInputKmsKey();
          await client.validateConnection();
          return inputs;
        });
      }
      case KmsProviders.Gcp: {
        const client = await this.providers.gcp({ inputs: provider.inputs });
        return ExternalKmsService.withClient(client, "GCP", "Failed to validate GCP connection", async () => {
          await client.validateConnection();
          return provider.inputs;
        });
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
        return ExternalKmsService.withClient(client, "AWS", "Failed to validate AWS connection", async () => {
          await client.validateConnection();
          return inputs;
        });
      }
      case KmsProviders.Gcp: {
        const inputs = { ...ExternalKmsGcpSchema.parse(current), ...provider.inputs };
        const client = await this.providers.gcp({ inputs });
        return ExternalKmsService.withClient(client, "GCP", "Failed to validate GCP connection", async () => {
          await client.validateConnection();
          return inputs;
        });
      }
      default:
        throw new RuleViolationError({ message: "external kms provided is invalid" });
    }
  }

  // Words a provider failure for the user and always releases the client.
  private static async withClient<T>(
    client: { cleanup(): Promise<void> },
    provider: string,
    fallback: string,
    work: () => Promise<T>
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw providerError(provider, error, fallback);
    } finally {
      await client.cleanup();
    }
  }

  private static openInputs(key: KmsKey, orgCipher: TCipherPair): TProviderInput {
    const ref = key.externalRef();
    if (!ref) throw notFound(key.id);
    return openProviderInputs(ref, orgCipher).inputs;
  }

  private static statusOf(key: KmsKey) {
    const status = key.externalStatus();
    if (!status) throw notFound(key.id);
    return status;
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
