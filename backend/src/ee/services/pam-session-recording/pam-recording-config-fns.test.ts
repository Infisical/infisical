import { describe, expect, it } from "vitest";

import { PamRecordingAzureBlobConfigSchema } from "../pam-account-template/pam-account-template-schemas";
import {
  getOverrideRecordingLocation,
  getRecordingLocation,
  getTemplateRecordingBackend
} from "./pam-recording-config-fns";
import { PamRecordingStorageBackend } from "./pam-recording-enums";

const azureTemplate = {
  recordingStorageBackend: "azure-blob",
  recordingAzureBlobConfig: { container: "template-container", keyPrefix: "tpl/" }
};
const s3Template = {
  recordingStorageBackend: "aws-s3",
  recordingS3Config: { bucket: "tpl-bucket", region: "us-east-1" }
};

describe("getTemplateRecordingBackend", () => {
  it("defaults to postgres for missing or unknown settings", () => {
    expect(getTemplateRecordingBackend(null)).toBe(PamRecordingStorageBackend.Postgres);
    expect(getTemplateRecordingBackend({ recordingStorageBackend: "gcs" })).toBe(PamRecordingStorageBackend.Postgres);
  });

  it("reads the template's backend", () => {
    expect(getTemplateRecordingBackend(azureTemplate)).toBe(PamRecordingStorageBackend.AzureBlob);
  });
});

describe("getRecordingLocation", () => {
  it("uses the account override before the template", () => {
    const location = getRecordingLocation(
      PamRecordingStorageBackend.AzureBlob,
      { recordingAzureBlobConfig: { container: "account-container" } },
      azureTemplate
    );
    expect(location).toEqual({ backend: "azure-blob", config: { container: "account-container" } });
  });

  it("falls back to the template and ignores another store's override", () => {
    const location = getRecordingLocation(
      PamRecordingStorageBackend.AzureBlob,
      { recordingS3Config: { bucket: "stale" } },
      azureTemplate
    );
    expect(location?.config).toEqual({ container: "template-container", keyPrefix: "tpl/" });
  });

  it("reads S3 locations unchanged", () => {
    expect(getRecordingLocation(PamRecordingStorageBackend.AwsS3, null, s3Template)?.config).toEqual({
      bucket: "tpl-bucket",
      region: "us-east-1"
    });
  });

  it("returns nothing for postgres", () => {
    expect(getRecordingLocation(PamRecordingStorageBackend.Postgres, null, azureTemplate)).toBeNull();
  });
});

describe("getOverrideRecordingLocation", () => {
  it("only reads the account's own override", () => {
    expect(getOverrideRecordingLocation(PamRecordingStorageBackend.AzureBlob, null)).toBeNull();
    expect(
      getOverrideRecordingLocation(PamRecordingStorageBackend.AzureBlob, {
        recordingAzureBlobConfig: { container: "abc" }
      })
    ).toEqual({ backend: "azure-blob", config: { container: "abc" } });
  });
});

describe("PamRecordingAzureBlobConfigSchema", () => {
  it.each(["pam-recordings", "abc", "a1-b2-c3"])("accepts container %s", (container) => {
    expect(PamRecordingAzureBlobConfigSchema.safeParse({ container }).success).toBe(true);
  });

  it.each(["ab", "Bad", "a--b", "-ab", "ab-", "a_b"])("rejects container %s", (container) => {
    expect(PamRecordingAzureBlobConfigSchema.safeParse({ container }).success).toBe(false);
  });

  it.each(["x/../", "./x", "a\\b", "a?b", "a#b"])("rejects key prefix %s", (keyPrefix) => {
    expect(PamRecordingAzureBlobConfigSchema.safeParse({ container: "abc", keyPrefix }).success).toBe(false);
  });

  it("accepts a normal key prefix", () => {
    expect(
      PamRecordingAzureBlobConfigSchema.safeParse({ container: "abc", keyPrefix: "pam/recordings/" }).success
    ).toBe(true);
  });
});
