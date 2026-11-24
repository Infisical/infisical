import { RestError, StorageSharedKeyCredential } from "@azure/storage-blob";
import { describe, expect, it, vi } from "vitest";

import { PamRecordingStorageBackend } from "../pam-recording-enums";
import { TPamRecordingResolvedConfig } from "../pam-recording-storage-types";
import { AzureBlobRecordingStorageProvider } from "./azure-blob-provider-factory";

const ACCOUNT = "testaccount";

const buildConfig = (getProperties: () => Promise<{ contentLength?: number }>): TPamRecordingResolvedConfig => {
  const blobClient = {
    getProperties,
    url: `https://${ACCOUNT}.blob.core.windows.net/recordings/key`
  };
  const serviceClient = {
    getContainerClient: () => ({
      getBlobClient: (name: string) => ({
        ...blobClient,
        url: `https://${ACCOUNT}.blob.core.windows.net/recordings/${name}`
      })
    })
  };
  return {
    backend: PamRecordingStorageBackend.AzureBlob,
    bucket: "recordings",
    keyPrefix: "pfx/",
    azure: {
      accountName: ACCOUNT,
      serviceClient: serviceClient as never,
      sharedKeyCredential: new StorageSharedKeyCredential(ACCOUNT, Buffer.from("test-key").toString("base64")),
      getUserDelegationKey: vi.fn()
    }
  };
};

describe("AzureBlobRecordingStorageProvider", () => {
  const provider = AzureBlobRecordingStorageProvider();

  it("mints a create/write SAS that asks for a block blob upload", async () => {
    const result = await provider.mintPresignedPut({
      config: buildConfig(async () => ({})),
      projectId: "proj",
      sessionId: "sess",
      chunkIndex: 3,
      ciphertextBytes: 100
    });
    const url = new URL(result.url);
    expect(url.pathname).toBe("/recordings/pfx/proj/sess/chunk-000003.json.enc");
    expect(url.searchParams.get("sp")).toBe("cw");
    expect(url.searchParams.get("spr")).toBe("https");
    expect(result.headers).toEqual({ "x-ms-blob-type": "BlockBlob" });
  });

  it("mints a read-only SAS for playback", async () => {
    const { url } = await provider.mintPresignedGet({ config: buildConfig(async () => ({})), objectKey: "a/b" });
    expect(new URL(url).searchParams.get("sp")).toBe("r");
  });

  it("rejects chunk sizes outside the limit", async () => {
    await expect(
      provider.mintPresignedPut({
        config: buildConfig(async () => ({})),
        projectId: "p",
        sessionId: "s",
        chunkIndex: 0,
        ciphertextBytes: 0
      })
    ).rejects.toThrow("Chunk size out of range");
  });

  it("accepts an upload whose size matches the declared size", async () => {
    await expect(
      provider.verifyUploadedObject?.({
        config: buildConfig(async () => ({ contentLength: 42 })),
        objectKey: "k",
        ciphertextBytes: 42
      })
    ).resolves.toBeUndefined();
  });

  it("rejects an upload whose size differs from the declared size", async () => {
    await expect(
      provider.verifyUploadedObject?.({
        config: buildConfig(async () => ({ contentLength: 999 })),
        objectKey: "k",
        ciphertextBytes: 42
      })
    ).rejects.toThrow("Uploaded chunk size does not match");
  });

  it("rejects metadata for a chunk that was never uploaded", async () => {
    await expect(
      provider.verifyUploadedObject?.({
        config: buildConfig(async () => {
          throw new RestError("not found", { statusCode: 404 });
        }),
        objectKey: "k",
        ciphertextBytes: 42
      })
    ).rejects.toThrow("Chunk object was not uploaded");
  });
});
