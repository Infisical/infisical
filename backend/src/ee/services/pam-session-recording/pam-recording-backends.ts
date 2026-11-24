import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";

import { PamRecordingStorageBackend } from "./pam-recording-enums";

export type TPamExternalRecordingBackend = Exclude<PamRecordingStorageBackend, PamRecordingStorageBackend.Postgres>;

export const isExternalRecordingBackend = (
  backend: PamRecordingStorageBackend | string | null | undefined
): backend is TPamExternalRecordingBackend =>
  backend === PamRecordingStorageBackend.AwsS3 || backend === PamRecordingStorageBackend.AzureBlob;

export const PAM_RECORDING_BACKEND_DETAILS: Record<
  TPamExternalRecordingBackend,
  {
    name: string;
    locationName: string;
    settingsKey: "recordingS3Config" | "recordingAzureBlobConfig";
    connectionApps: AppConnection[];
  }
> = {
  [PamRecordingStorageBackend.AwsS3]: {
    name: "S3",
    locationName: "bucket",
    settingsKey: "recordingS3Config",
    connectionApps: [AppConnection.AWS, AppConnection.S3Compatible]
  },
  [PamRecordingStorageBackend.AzureBlob]: {
    name: "Azure Blob Storage",
    locationName: "container",
    settingsKey: "recordingAzureBlobConfig",
    connectionApps: [AppConnection.AzureBlobStorage]
  }
};

export const describeRecordingConnectionApps = (backend: TPamExternalRecordingBackend) =>
  `${PAM_RECORDING_BACKEND_DETAILS[backend].connectionApps.map((app) => `an ${APP_CONNECTION_NAME_MAP[app]}`).join(" or ")} connection`;

export const PAM_RECORDING_CONNECTION_APPS = Object.values(PAM_RECORDING_BACKEND_DETAILS).flatMap(
  (details) => details.connectionApps
);

export const PAM_GATEWAY_AZURE_BLOB_RECORDING_CAPABILITY = "azureBlobRecording";

type TGatewayOptions = { filter?: (gateway: { capabilities?: unknown }) => boolean; unavailableMessage?: string };

// Older gateways reject a backend they don't know, so their sessions would run unrecorded.
export const recordingGatewayOptions = (account: { templateSettings?: unknown }): TGatewayOptions =>
  (account.templateSettings as { recordingStorageBackend?: string } | null | undefined)?.recordingStorageBackend ===
  PamRecordingStorageBackend.AzureBlob
    ? {
        filter: (gateway) =>
          (gateway.capabilities as Record<string, unknown> | null | undefined)?.[
            PAM_GATEWAY_AZURE_BLOB_RECORDING_CAPABILITY
          ] === true,
        unavailableMessage:
          "No healthy gateway in this account's gateway pool can record sessions to Azure Blob Storage. Update the pool's gateways to the latest version."
      }
    : {};

export const combineGatewayOptions = (...options: TGatewayOptions[]): TGatewayOptions => {
  const active = options.filter((option) => option.filter);
  if (active.length <= 1) return active[0] ?? {};
  return {
    filter: (gateway) => active.every((option) => option.filter?.(gateway)),
    unavailableMessage: active.map((option) => option.unavailableMessage).join(" ")
  };
};
