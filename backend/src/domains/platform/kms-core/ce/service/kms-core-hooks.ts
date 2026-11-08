import { TKmsKeyRecord } from "../model/kms-key";
import { TCipherPair } from "./kms-core-types";

// Wraps the root key with an HSM. From the enterprise edition.
export type TRootKeyWrapper = {
  // Whether an HSM is configured and passes its self-test.
  isConfigured(): Promise<boolean>;
  // Refuses with the license message when the instance is not entitled to HSM.
  assertEntitled(): void;
  randomBytes(length: number): Promise<Buffer>;
  wrap(rootKey: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
};

// An external key as the hook sees it: the stored row and its provider inputs, still encrypted.
export type TExternalKeyRef = {
  kmsKeyId: string;
  orgId: string;
  provider: string;
  encryptedProviderInputs: Buffer;
};

export type TExternalKmsConfig = {
  id: string;
  kmsKeyId: string;
  provider: string;
  status?: string | null;
  statusDetails?: string | null;
  // Decrypted provider inputs. Holds credentials: callers return only the sanitized form.
  providerInput: Record<string, unknown>;
};

export type TExternalKmsDetails = TKmsKeyRecord & { external: TExternalKmsConfig };

export type TExternalKmsSummary = TKmsKeyRecord & {
  externalKms: { id: string; provider: string; status?: string | null; statusDetails?: string | null };
};

export type TCreateExternalKmsInput = {
  orgId: string;
  name?: string;
  description?: string;
  // { type, inputs }: validated by the enterprise edition, which knows the providers.
  provider: { type: string; inputs: unknown };
};

export type TUpdateExternalKmsInput = {
  kmsId: string;
  name?: string;
  description?: string;
  provider?: { type: string; inputs: unknown };
};

// External KMS keys (AWS, GCP). From the enterprise edition. Every call that opens or writes provider inputs is
// handed the org data-key cipher, so the enterprise edition never holds the community module.
export type TExternalKmsHook = {
  encrypt(key: TExternalKeyRef, orgCipher: TCipherPair, plainText: Buffer): Promise<Buffer<ArrayBuffer>>;
  decrypt(key: TExternalKeyRef, orgCipher: TCipherPair, cipherTextBlob: Buffer): Promise<Buffer<ArrayBuffer>>;
  create(input: TCreateExternalKmsInput, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  update(input: TUpdateExternalKmsInput, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  delete(kmsId: string, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  get(kmsId: string, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  list(orgId: string): Promise<TExternalKmsSummary[]>;
  fetchGcpKeys(input: { credential: unknown; gcpRegion: string }): Promise<{ keys: string[] }>;
};

export type TKmsCoreHooks = {
  rootKeyWrapper?: TRootKeyWrapper;
  externalKms?: TExternalKmsHook;
};
