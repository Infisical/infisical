import path from "node:path";

const loadEnvFileIfPresent = (envPath: string) => {
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

export const loadPackageEnv = (packageRoot: string) => {
  loadEnvFileIfPresent(path.join(packageRoot, ".env"));
  loadEnvFileIfPresent(path.join(packageRoot, ".env.local"));
};
