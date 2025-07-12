import fs from "fs/promises";
import os from "os";
import path from "path";

import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

const baseDir = path.join(os.tmpdir(), "infisical");
const randomPath = () => `${crypto.randomBytes(32).toString("hex")}`;

export const createTemporaryDirectory = async (name: string) => {
  const tempDirPath = path.join(baseDir, `${name}-${randomPath()}`);
  await fs.mkdir(tempDirPath, { recursive: true });

  return tempDirPath;
};

export const removeTemporaryBaseDirectory = async () => {
  await fs.rm(baseDir, { force: true, recursive: true }).catch((err) => {
    logger.error(err, `Failed to remove temporary base directory [path=${baseDir}]`);
  });
};

export const cleanTemporaryDirectory = async (dirPath: string) => {
  await fs.rm(dirPath, { recursive: true, force: true }).catch((err) => {
    logger.error(err, `Failed to cleanup temporary directory [path=${dirPath}]`);
  });
};

export const writeToTemporaryFile = async (tempDirPath: string, data: string | Buffer) => {
  await fs.writeFile(tempDirPath, data, { mode: 0o600 }).catch((err) => {
    logger.error(err, `Failed to write to temporary file [path=${tempDirPath}]`);
    throw err;
  });
};
