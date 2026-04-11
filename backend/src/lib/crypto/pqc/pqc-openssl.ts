import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { logger } from "@app/lib/logger";

const DEFAULT_BIN_PATH = "/opt/openssl-pqc/bin/openssl";
const DEFAULT_LIB_PATH = "/opt/openssl-pqc/lib64:/opt/openssl-pqc/lib";

let resolvedBinPath: string | null = null;
let resolvedLibPath: string | null = null;

const getPqcOpenSSLBinPath = (): string => {
  if (!resolvedBinPath) {
    resolvedBinPath = process.env.PQC_OPENSSL_BIN_PATH || DEFAULT_BIN_PATH;
  }
  return resolvedBinPath;
};

const getPqcOpenSSLLibPath = (): string => {
  if (!resolvedLibPath) {
    resolvedLibPath = process.env.PQC_OPENSSL_LIB_PATH || DEFAULT_LIB_PATH;
  }
  return resolvedLibPath;
};

const buildPqcEnv = (): NodeJS.ProcessEnv => {
  const { OPENSSL_CONF, OPENSSL_MODULES, ...rest } = process.env;
  return {
    ...rest,
    LD_LIBRARY_PATH: [getPqcOpenSSLLibPath(), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":")
  };
};

const execOpenSSL = (args: string[], stdin?: Buffer): Promise<{ stdout: Buffer; stderr: string; code: number }> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(getPqcOpenSSLBinPath(), args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildPqcEnv()
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn PQC OpenSSL at '${getPqcOpenSSLBinPath()}': ${err.message}`));
    });

    proc.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString(),
        code: code ?? 1
      });
    });

    if (stdin) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
};

const execOpenSSLOrThrow = async (args: string[], stdin?: Buffer): Promise<Buffer> => {
  const { stdout, stderr, code } = await execOpenSSL(args, stdin);
  if (code !== 0) {
    throw new Error(`PQC OpenSSL command failed (exit ${code}): ${stderr}`);
  }
  return stdout;
};

const withTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = await mkdtemp(join(tmpdir(), "pqc-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

export const opensslGenpkey = async (algorithm: string): Promise<Buffer> => {
  return execOpenSSLOrThrow(["genpkey", "-algorithm", algorithm, "-outform", "DER"]);
};

export const opensslDerivePublicKey = async (privateDer: Buffer): Promise<Buffer> => {
  return withTempDir(async (dir) => {
    const keyPath = join(dir, "key.der");
    await writeFile(keyPath, privateDer, { mode: 0o600 });
    return execOpenSSLOrThrow(["pkey", "-in", keyPath, "-inform", "DER", "-outform", "DER", "-pubout"]);
  });
};

export const opensslSign = async (privateDer: Buffer, data: Buffer): Promise<Buffer> => {
  return withTempDir(async (dir) => {
    const keyPath = join(dir, "key.der");
    const dataPath = join(dir, "data.bin");
    await Promise.all([writeFile(keyPath, privateDer, { mode: 0o600 }), writeFile(dataPath, data, { mode: 0o600 })]);
    return execOpenSSLOrThrow(["pkeyutl", "-sign", "-inkey", keyPath, "-keyform", "DER", "-in", dataPath]);
  });
};

export const opensslVerify = async (publicDer: Buffer, signature: Buffer, data: Buffer): Promise<boolean> => {
  return withTempDir(async (dir) => {
    const keyPath = join(dir, "pub.der");
    const sigPath = join(dir, "sig.bin");
    const dataPath = join(dir, "data.bin");
    await Promise.all([
      writeFile(keyPath, publicDer, { mode: 0o600 }),
      writeFile(sigPath, signature, { mode: 0o600 }),
      writeFile(dataPath, data, { mode: 0o600 })
    ]);
    const { code } = await execOpenSSL([
      "pkeyutl",
      "-verify",
      "-pubin",
      "-inkey",
      keyPath,
      "-keyform",
      "DER",
      "-sigfile",
      sigPath,
      "-in",
      dataPath
    ]);
    return code === 0;
  });
};

export const verifyPqcOpenSSLAvailability = async (): Promise<boolean> => {
  try {
    const { stdout, code } = await execOpenSSL(["version"]);
    if (code !== 0) {
      logger?.warn(
        "PQC OpenSSL binary not found or failed to execute. PQC certificate operations will not be available."
      );
      return false;
    }

    const version = stdout.toString().trim();
    logger?.info(`PQC OpenSSL detected: ${version}`);

    // Quick check: try to generate a throwaway ML-DSA-44 key (smallest/fastest variant)
    const { code: genCode } = await execOpenSSL(["genpkey", "-algorithm", "ML-DSA-44", "-outform", "DER"]);
    if (genCode !== 0) {
      logger?.warn(`PQC OpenSSL (${version}) does not support ML-DSA. PQC operations will not be available.`);
      return false;
    }

    return true;
  } catch {
    logger?.warn("PQC OpenSSL binary not available. PQC certificate operations will not be available.");
    return false;
  }
};
