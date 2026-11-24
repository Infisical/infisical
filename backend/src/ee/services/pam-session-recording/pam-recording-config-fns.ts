import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";

import {
  PamAccountSettingsOverridesSchema,
  PamTemplateSettingsSchema,
  TPamRecordingAzureBlobConfig,
  TPamRecordingS3Config
} from "../pam-account-template/pam-account-template-schemas";
import { resolveS3RecordingAccess } from "./aws-s3/aws-s3-provider-factory";
import { resolveAzureBlobRecordingAccess } from "./azure-blob/azure-blob-provider-factory";
import {
  isExternalRecordingBackend,
  PAM_RECORDING_BACKEND_DETAILS,
  TPamExternalRecordingBackend
} from "./pam-recording-backends";
import { PamRecordingStorageBackend } from "./pam-recording-enums";
import { TPamRecordingResolvedConfig } from "./pam-recording-storage-types";

export type TPamRecordingLocation =
  | { backend: PamRecordingStorageBackend.AwsS3; config: TPamRecordingS3Config }
  | { backend: PamRecordingStorageBackend.AzureBlob; config: TPamRecordingAzureBlobConfig };

export const getTemplateRecordingBackend = (templateSettings: unknown): PamRecordingStorageBackend =>
  PamTemplateSettingsSchema.safeParse(templateSettings ?? {}).data?.recordingStorageBackend ??
  PamRecordingStorageBackend.Postgres;

const getLocationConfig = (backend: TPamExternalRecordingBackend, settings: unknown) => {
  const raw = (settings as Record<string, unknown> | null | undefined)?.[
    PAM_RECORDING_BACKEND_DETAILS[backend].settingsKey
  ];
  if (!raw) return null;
  const parsed = PamAccountSettingsOverridesSchema.safeParse({
    [PAM_RECORDING_BACKEND_DETAILS[backend].settingsKey]: raw
  });
  return parsed.success ? (parsed.data[PAM_RECORDING_BACKEND_DETAILS[backend].settingsKey] ?? null) : null;
};

export const getRecordingLocation = (
  backend: PamRecordingStorageBackend,
  settingsOverrides: unknown,
  templateSettings: unknown
): TPamRecordingLocation | null => {
  if (!isExternalRecordingBackend(backend)) return null;
  const config = getLocationConfig(backend, settingsOverrides) ?? getLocationConfig(backend, templateSettings);
  return config ? ({ backend, config } as TPamRecordingLocation) : null;
};

export const getOverrideRecordingLocation = (
  backend: PamRecordingStorageBackend,
  settingsOverrides: unknown
): TPamRecordingLocation | null => {
  if (!isExternalRecordingBackend(backend)) return null;
  const config = getLocationConfig(backend, settingsOverrides);
  return config ? ({ backend, config } as TPamRecordingLocation) : null;
};

export const buildExternalRecordingConfig = async (
  location: TPamRecordingLocation,
  appConnection: TAppConnection,
  instanceConfigService: TInstanceConfigService
): Promise<TPamRecordingResolvedConfig> => {
  if (location.backend === PamRecordingStorageBackend.AzureBlob) {
    return {
      backend: PamRecordingStorageBackend.AzureBlob,
      bucket: location.config.container,
      keyPrefix: location.config.keyPrefix ?? null,
      ...resolveAzureBlobRecordingAccess(appConnection)
    };
  }

  return {
    backend: PamRecordingStorageBackend.AwsS3,
    bucket: location.config.bucket,
    keyPrefix: location.config.keyPrefix ?? null,
    ...(await resolveS3RecordingAccess(appConnection, location.config.region, instanceConfigService))
  };
};
