import { TPamRecordingStorageProvider } from "../pam-session-recording-storage-types";

// Postgres backend: chunks are stored inline in the chunks table
// All upload/playback flows go through the backend (gateway POSTs ciphertext, browser GETs ciphertext)
export const PostgresRecordingStorageProvider: TPamRecordingStorageProvider = () => ({
  validateConfig: async () => {
    // Postgres is always available; nothing to validate
  },
  mintPresignedPut: async () => {
    throw new Error(
      "Postgres recording backend does not support presigned PUT URLs; gateway must POST ciphertext directly to backend"
    );
  },
  mintPresignedGet: async () => {
    throw new Error("Postgres recording backend does not support presigned GET URLs; backend serves ciphertext inline");
  },
  deleteSession: async () => {
    // Chunks cascade-delete with the session row
  }
});
