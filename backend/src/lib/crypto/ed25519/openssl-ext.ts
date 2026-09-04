import { spawn } from "child_process";

import { logger } from "@app/lib/logger";

const DEFAULT_BIN_PATH = "/opt/openssl-ext";

let resolvedBinPath: string | null = null;
let available = false;

export const getOpenSSLExtBinPath = (): string => {
  if (!resolvedBinPath) {
    resolvedBinPath = process.env.OPENSSL_EXT_BIN_PATH || DEFAULT_BIN_PATH;
  }
  return resolvedBinPath;
};

const execOpenSSLExt = (args: string[]): Promise<{ stderr: string; code: number }> =>
  new Promise((resolve, reject) => {
    const proc = spawn(getOpenSSLExtBinPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderrChunks: Buffer[] = [];

    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn OpenSSL extension at '${getOpenSSLExtBinPath()}': ${err.message}`));
    });
    proc.on("close", (code) => {
      resolve({ stderr: Buffer.concat(stderrChunks).toString(), code: code ?? 1 });
    });
  });

/** Checks the binary and the OpenSSL Ed25519ph provider implementation at startup. */
export const initializeOpenSSLExtSupport = async (): Promise<void> => {
  try {
    const result = await execOpenSSLExt(["-check"]);
    available = result.code === 0;

    if (available) {
      logger?.info("OpenSSL extension detected: Ed25519ph signing is available.");
    } else {
      logger?.warn("OpenSSL extension is unavailable. Ed25519ph signing will be disabled.");
    }
  } catch {
    available = false;
    logger?.warn("OpenSSL extension binary is unavailable. Ed25519ph signing will be disabled.");
  }
};

export const isOpenSSLExtAvailable = (): boolean => available;
