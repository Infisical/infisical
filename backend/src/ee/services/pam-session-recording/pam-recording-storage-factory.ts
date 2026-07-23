import { AwsS3RecordingStorageProvider } from "./aws-s3/aws-s3-provider-factory";
import { PamRecordingStorageBackend } from "./pam-recording-enums";
import { TPamRecordingStorageProvider } from "./pam-recording-storage-types";
import { PostgresRecordingStorageProvider } from "./postgres/postgres-provider-factory";

export const PAM_RECORDING_STORAGE_FACTORY_MAP: Record<PamRecordingStorageBackend, TPamRecordingStorageProvider> = {
  [PamRecordingStorageBackend.Postgres]: PostgresRecordingStorageProvider,
  [PamRecordingStorageBackend.AwsS3]: AwsS3RecordingStorageProvider
};
