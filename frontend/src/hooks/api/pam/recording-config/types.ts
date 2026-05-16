import { TPamRecordingStorageBackend } from "../session-playback/types";

export type { TPamRecordingStorageBackend };

export type TPamRecordingConfig = {
  id: string;
  projectId: string;
  storageBackend: TPamRecordingStorageBackend;
  connectionId: string;
  bucket: string;
  region: string;
  keyPrefix: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TUpsertPamRecordingConfigDTO = {
  projectId: string;
  storageBackend: TPamRecordingStorageBackend;
  connectionId: string;
  bucket: string;
  region: string;
  keyPrefix?: string | null;
};
