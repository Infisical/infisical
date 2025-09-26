/* eslint-disable no-console */
import { readFile } from "fs/promises";
import * as yaml from "js-yaml";
import * as path from "path";
import { z } from "zod";

import { upgradePathConfigSchema } from "../src/services/upgrade-path/upgrade-path-schemas";

async function validateUpgradePathConfig(): Promise<void> {
  try {
    const yamlPath = path.join(__dirname, "..", "upgrade-path.yaml");
    const resolvedPath = path.resolve(yamlPath);
    const expectedBaseDir = path.resolve(__dirname, "..");

    if (!resolvedPath.startsWith(expectedBaseDir)) {
      throw new Error("Invalid configuration file path");
    }

    try {
      await readFile(yamlPath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        console.log("Warning: No upgrade-path.yaml file found");
        return;
      }
      throw error;
    }

    const yamlContent = await readFile(yamlPath, "utf8");

    if (yamlContent.length > 1024 * 1024) {
      throw new Error("Config file too large (>1MB)");
    }

    let config: unknown;
    try {
      config = yaml.load(yamlContent, {
        schema: yaml.FAILSAFE_SCHEMA,
        filename: yamlPath,
        onWarning: (warning) => {
          console.log(`YAML Warning: ${warning.message}`);
        }
      });
    } catch (yamlError) {
      if (yamlError instanceof yaml.YAMLException) {
        throw new Error(
          `YAML parsing failed: ${yamlError.message} at line ${yamlError.mark?.line}, column ${yamlError.mark?.column}`
        );
      }
      throw new Error(`YAML parsing failed: ${yamlError instanceof Error ? yamlError.message : "Unknown YAML error"}`);
    }

    if (!config) {
      console.log("Warning: Empty configuration file");
      return;
    }

    if (typeof config !== "object" || config === null) {
      throw new Error("Configuration must be a valid YAML object");
    }

    const result = upgradePathConfigSchema.safeParse(config);

    if (!result.success) {
      console.log("Validation failed with the following errors:");
      result.error.issues.forEach((issue: z.ZodIssue) => {
        const issuePath = issue.path.length > 0 ? `[${issue.path.join(".")}]` : "";
        console.log(`  - ${issuePath}: ${issue.message}`);
      });
      throw new Error("Schema validation failed");
    }

    const validatedConfig = result.data;
    const versions = validatedConfig?.versions || {};
    const versionCount = Object.keys(versions).length;

    if (versionCount === 0) {
      console.log("Warning: No versions found in the configuration");
    } else {
      console.log(`Validated ${versionCount} version configuration(s)`);

      const commonPatterns = [
        /^v?\d+\.\d+\.\d+$/,
        /^v?\d+\.\d+\.\d+\.\d+$/,
        /^infisical\/v?\d+\.\d+\.\d+$/,
        /^infisical\/v?\d+\.\d+\.\d+-\w+$/
      ];

      for (const versionKey of Object.keys(versions)) {
        const isCommonPattern = commonPatterns.some((pattern) => pattern.test(versionKey));
        if (!isCommonPattern) {
          console.log(`Warning: Version key '${versionKey}' doesn't match common patterns. This may be intentional.`);
        }
      }
    }

    console.log("upgrade-path.yaml format is valid");
  } catch (error) {
    console.error(`Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}

if (require.main === module) {
  validateUpgradePathConfig().catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
}

export { validateUpgradePathConfig };
