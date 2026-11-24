import { describe, expect, it } from "vitest";

import { combineGatewayOptions, recordingGatewayOptions } from "./pam-recording-backends";
import { PamRecordingStorageBackend } from "./pam-recording-enums";

describe("recordingGatewayOptions", () => {
  it("adds no filter for backends every gateway supports", () => {
    expect(recordingGatewayOptions({ templateSettings: { recordingStorageBackend: "aws-s3" } })).toEqual({});
    expect(recordingGatewayOptions({ templateSettings: null })).toEqual({});
  });

  it("requires the Azure Blob capability for Azure-backed templates", () => {
    const { filter } = recordingGatewayOptions({
      templateSettings: { recordingStorageBackend: PamRecordingStorageBackend.AzureBlob }
    });
    expect(filter?.({ capabilities: { azureBlobRecording: true } })).toBe(true);
    expect(filter?.({ capabilities: {} })).toBe(false);
    expect(filter?.({ capabilities: null })).toBe(false);
  });
});

describe("combineGatewayOptions", () => {
  const masking = { filter: (g: { capabilities?: unknown }) => Boolean(g.capabilities), unavailableMessage: "A." };
  const azure = recordingGatewayOptions({ templateSettings: { recordingStorageBackend: "azure-blob" } });

  it("returns the single active option unchanged", () => {
    expect(combineGatewayOptions({}, masking)).toBe(masking);
    expect(combineGatewayOptions({}, {})).toEqual({});
  });

  it("requires every active filter and joins the messages", () => {
    const combined = combineGatewayOptions(masking, azure);
    expect(combined.filter?.({ capabilities: { azureBlobRecording: true } })).toBe(true);
    expect(combined.filter?.({ capabilities: { outputMasking: true } })).toBe(false);
    expect(combined.unavailableMessage).toContain("A.");
    expect(combined.unavailableMessage).toContain("Azure Blob Storage");
  });
});
