import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { PamRecordingStorageBackend } from "../pam-session-recording-storage/pam-session-recording-storage-enums";

export type TUpsertPamRecordingConfigDTO = {
  projectId: string;
  storageBackend: PamRecordingStorageBackend;
  connectionId: string;
  bucket: string;
  region: AWSRegion;
  keyPrefix?: string | null;
};

export type TGetPamRecordingConfigDTO = {
  projectId: string;
};

export type TDeletePamRecordingConfigDTO = {
  projectId: string;
};
