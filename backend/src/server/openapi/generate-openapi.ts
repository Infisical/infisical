import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger } from "@app/lib/logger";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";

import { buildOpenApiArtifacts, writeOpenApiArtifacts } from "./build-openapi-artifacts";
import { buildOpenApiSpec } from "./build-openapi-spec";

// Config parsing requires these, but registering routes never connects to anything.
const PLACEHOLDER_ENV: Record<string, string> = {
  DB_CONNECTION_URI: "postgres://openapi-generator:5432/unused",
  REDIS_URL: "redis://openapi-generator:6379",
  ENCRYPTION_KEY: "4bnfe4e407b8921c104518903515b218",
  AUTH_SECRET: "openapi-generator-placeholder"
};

const run = async () => {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  if (!outDir) {
    // eslint-disable-next-line no-console
    console.error("Usage: generate-openapi --out <dir>");
    process.exit(1);
  }

  // In development registerResponseSchemaHooks unhides every route, so anything else would not be the
  // public spec.
  process.env.NODE_ENV = "production";
  for (const [key, value] of Object.entries(PLACEHOLDER_ENV)) {
    process.env[key] ??= value;
  }
  // Some routers log while they register (eg secret-scanner-v2 when GitHub Radar is not configured).
  initLogger();
  // Without the DAL arguments this only parses the environment.
  await initEnvConfig(undefined as unknown as THsmServiceFactory, undefined as unknown as TKmsRootConfigDALFactory);

  if (!getConfig().isApiRunModeEnabled) {
    throw new Error(
      "The OpenAPI spec would be missing the API routes because INFISICAL_RUN_MODES does not include 'api'. Unset INFISICAL_RUN_MODES or include 'api' when generating the spec."
    );
  }

  await writeOpenApiArtifacts(await buildOpenApiArtifacts(await buildOpenApiSpec()), outDir);
};

// Some modules the routers import hold timers or sockets open, so the process would not exit by itself.
void run()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
