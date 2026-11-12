import {
  AsymmetricKeyAlgorithm,
  type HmacAlgorithm as THmacAlgorithm,
  HmacAlgorithm,
  KmsKeyUsage,
  SymmetricKeyAlgorithm,
  type TCmek
} from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { KmsAdapter } from "./contract";

const projectId = "kms-keys";
const key = (
  id: string,
  name: string,
  description: string,
  keyUsage: KmsKeyUsage,
  algorithm: TCmek["algorithm"],
  createdAt: string,
  extra: Partial<TCmek> = {}
): TCmek => ({
  id,
  name,
  description,
  keyUsage,
  algorithm,
  projectId,
  orgId: V4_DEMO_ORG_ID,
  isDisabled: false,
  isReserved: false,
  isExportable: true,
  hasDeleteProtection: false,
  version: 1,
  createdAt,
  updatedAt: createdAt,
  ...extra
});

const store = createFixtureStore<TCmek[]>([
  key(
    "3f6c1a2e-8b4d-4e0f-9a7c-51d2e8b06f14",
    "backup-signing",
    "Nightly database backup archives",
    KmsKeyUsage.ENCRYPT_DECRYPT,
    SymmetricKeyAlgorithm.AES_GCM_256,
    "2026-04-07T09:12:00Z"
  ),
  key(
    "9b2e47d0-1c5a-4f8e-b3d6-0a7e9c4f2b81",
    "billing-pii",
    "Cardholder data in the billing service",
    KmsKeyUsage.ENCRYPT_DECRYPT,
    SymmetricKeyAlgorithm.AES_GCM_256,
    "2025-11-03T16:40:00Z",
    { version: 4, isExportable: false, hasDeleteProtection: true }
  ),
  key(
    "c41d8e06-7a3b-4b92-8f5e-2d6a0b9c7e33",
    "customer-exports",
    "Customer data export downloads",
    KmsKeyUsage.ENCRYPT_DECRYPT,
    SymmetricKeyAlgorithm.AES_GCM_256,
    "2026-02-18T11:05:00Z",
    { version: 2 }
  ),
  key(
    "5a0f93b7-2e6d-4c18-a4b0-8d3f1e7c6a59",
    "legacy-exports",
    "Replaced by customer-exports",
    KmsKeyUsage.ENCRYPT_DECRYPT,
    SymmetricKeyAlgorithm.AES_GCM_128,
    "2024-12-02T08:30:00Z",
    { version: 3, isDisabled: true }
  ),
  key(
    "e7b3290c-4f1a-4d6e-9c85-3b0a7d2e1f46",
    "release-signing",
    "Signs CLI and agent release artifacts",
    KmsKeyUsage.SIGN_VERIFY,
    AsymmetricKeyAlgorithm.RSA_4096,
    "2026-03-10T14:22:00Z",
    { isExportable: false, hasDeleteProtection: true }
  ),
  key(
    "1d8a6f25-9e0b-4a73-b2c4-6f5e8d1a0c97",
    "session-tokens",
    "Signs short-lived session tokens",
    KmsKeyUsage.SIGN_VERIFY,
    AsymmetricKeyAlgorithm.ECC_NIST_P256,
    "2026-08-30T10:00:00Z"
  ),
  key(
    "82c5e0f9-3b7d-4e1a-8a6c-0f4b9d2e7a18",
    "webhook-hmac",
    "Authenticates outbound webhook payloads",
    KmsKeyUsage.GENERATE_VERIFY_MAC,
    HmacAlgorithm.HMAC_SHA_256,
    "2026-05-21T13:45:00Z"
  )
]);

const material = (seed: string, bytes: number) => {
  let hash = 7;
  const out = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) {
    for (const char of `${seed}:${index}`) {
      hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
    }
    out[index] = hash % 256;
  }
  return Buffer.from(out).toString("base64");
};

const encode = (data: string, isBase64Encoded?: boolean) =>
  isBase64Encoded ? data : Buffer.from(data).toString("base64");

const findKey = (keyId: string) => {
  const found = store.get().find((entry) => entry.id === keyId);
  if (!found) throw new Error("Key not found");
  return found;
};

const isAsymmetric = (entry: TCmek) =>
  (Object.values(AsymmetricKeyAlgorithm) as string[]).includes(entry.algorithm);

const privateKeyOf = (entry: TCmek) => {
  if (entry.algorithm === SymmetricKeyAlgorithm.AES_GCM_128) return material(entry.id, 16);
  if (entry.keyUsage === KmsKeyUsage.SIGN_VERIFY) return material(`${entry.id}:private`, 120);
  return material(entry.id, 32);
};
const publicKeyOf = (entry: TCmek) => material(`${entry.id}:public`, 91);

const ciphertextPrefix = (keyId: string) => `demo:${keyId}:`;
const signatureOf = (keyId: string, algorithm: string, data: string) =>
  material(`${keyId}:${algorithm}:${data}`, 64);
const macOf = (keyId: string, data: string) => material(`${keyId}:mac:${data}`, 32);

const change = (keyId: string, patch: (current: TCmek) => Partial<TCmek>) =>
  store.update((keys) =>
    keys.map((entry) => (entry.id === keyId ? { ...entry, ...patch(entry) } : entry))
  );

export const kmsDemo: KmsAdapter = {
  useKeys: ({ offset = 0, limit = 100, orderDirection = OrderByDirection.ASC, search = "" }) => {
    const needle = search.trim().toLowerCase();
    const matched = store
      .use()
      .filter((entry) => !needle || entry.name.includes(needle) || entry.id.includes(needle))
      .sort(
        (a, b) => a.name.localeCompare(b.name) * (orderDirection === OrderByDirection.ASC ? 1 : -1)
      );
    return {
      data: { keys: matched.slice(offset, offset + limit), totalCount: matched.length },
      isPending: false,
      error: null
    };
  },
  useCreateKey: fixtureMutation((input) => {
    const created = key(
      crypto.randomUUID(),
      input.name,
      input.description ?? "",
      input.keyUsage,
      input.algorithm,
      new Date().toISOString(),
      { isExportable: input.isExportable ?? true, hasDeleteProtection: input.hasDeleteProtection }
    );
    store.update((keys) => [...keys, created]);
    return created;
  }),
  useUpdateKey: fixtureMutation(({ keyId, projectId: _projectId, ...patch }) =>
    change(keyId, () => patch)
  ),
  useRotateKey: fixtureMutation(({ keyId }) =>
    change(keyId, (current) => ({ version: current.version + 1 }))
  ),
  useDeleteKey: fixtureMutation(({ keyId }) =>
    store.update((keys) => keys.filter((entry) => entry.id !== keyId))
  ),
  useEncrypt: fixtureMutation(({ keyId, plaintext, isBase64Encoded }) => {
    findKey(keyId);
    return {
      ciphertext: Buffer.from(
        `${ciphertextPrefix(keyId)}${encode(plaintext, isBase64Encoded)}`
      ).toString("base64")
    };
  }),
  useDecrypt: fixtureMutation(({ keyId, ciphertext }) => {
    findKey(keyId);
    const decoded = Buffer.from(ciphertext.trim(), "base64").toString("utf8");
    if (!decoded.startsWith(ciphertextPrefix(keyId)))
      throw new Error("The ciphertext was not encrypted with this key");
    return { plaintext: decoded.slice(ciphertextPrefix(keyId).length) };
  }),
  useSign: fixtureMutation(({ keyId, data, signingAlgorithm, isBase64Encoded }) => {
    findKey(keyId);
    return {
      keyId,
      signingAlgorithm,
      signature: signatureOf(keyId, signingAlgorithm, encode(data, isBase64Encoded))
    };
  }),
  useVerify: fixtureMutation(({ keyId, data, signature, signingAlgorithm, isBase64Encoded }) => {
    findKey(keyId);
    return {
      keyId,
      signingAlgorithm,
      signatureValid:
        signature.trim() === signatureOf(keyId, signingAlgorithm, encode(data, isBase64Encoded))
    };
  }),
  useGenerateMac: fixtureMutation(({ keyId, data, isBase64Encoded }) => ({
    keyId,
    macAlgorithm: findKey(keyId).algorithm as THmacAlgorithm,
    mac: macOf(keyId, encode(data, isBase64Encoded))
  })),
  useVerifyMac: fixtureMutation(({ keyId, data, mac, isBase64Encoded }) => ({
    keyId,
    macAlgorithm: findKey(keyId).algorithm as THmacAlgorithm,
    macValid: mac.trim() === macOf(keyId, encode(data, isBase64Encoded))
  })),
  usePublicKey: (keyId, { enabled }) => {
    const entry = store.use().find((candidate) => candidate.id === keyId);
    return {
      data: enabled && entry && isAsymmetric(entry) ? { publicKey: publicKeyOf(entry) } : undefined,
      isPending: false,
      error: null
    };
  },
  usePrivateKey: (keyId, { enabled }) => {
    const entry = store.use().find((candidate) => candidate.id === keyId);
    return {
      data: enabled && entry?.isExportable ? { privateKey: privateKeyOf(entry) } : undefined,
      isPending: false,
      error: null
    };
  },
  useBulkExport: fixtureMutation(({ keyIds }) => ({
    keys: keyIds.map((keyId) => {
      const entry = findKey(keyId);
      return {
        keyId,
        name: entry.name,
        keyUsage: entry.keyUsage,
        algorithm: entry.algorithm,
        privateKey: privateKeyOf(entry),
        publicKey: isAsymmetric(entry) ? publicKeyOf(entry) : undefined
      };
    })
  })),
  useBulkImport: fixtureMutation(({ keys: entries }) => {
    const imported: { id: string; name: string }[] = [];
    const errors: { name: string; message: string }[] = [];
    entries.forEach((entry) => {
      if (store.get().some((existing) => existing.name === entry.name)) {
        errors.push({ name: entry.name, message: "A key with this name already exists" });
        return;
      }
      const created = key(
        crypto.randomUUID(),
        entry.name,
        "",
        entry.keyUsage,
        entry.algorithm,
        new Date().toISOString(),
        {
          isExportable: entry.isExportable ?? true,
          hasDeleteProtection: entry.hasDeleteProtection ?? false
        }
      );
      store.update((current) => [...current, created]);
      imported.push({ id: created.id, name: created.name });
    });
    return { keys: imported, errors };
  })
};

export const kmsDemoKeyCount = () => store.get().length;
