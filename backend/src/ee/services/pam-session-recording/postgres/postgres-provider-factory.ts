import { TPamRecordingStorageProvider } from "../pam-recording-storage-types";

export const PostgresRecordingStorageProvider: TPamRecordingStorageProvider = () => ({
  validateConfig: async () => {},
  mintPresignedPut: async () => {
    throw new Error(
      "Postgres recording backend does not support presigned PUT URLs; gateway must POST ciphertext directly to backend"
    );
  },
  mintPresignedGet: async () => {
    throw new Error("Postgres recording backend does not support presigned GET URLs; backend serves ciphertext inline");
  },
  readObject: async () => {
    throw new Error("Postgres recording backend stores ciphertext inline on the chunk row; there is no object to read");
  },
  deleteSession: async () => {}
});
