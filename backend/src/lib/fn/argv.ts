import { logger } from "../logger";

export const isMigrationMode = () => {
  try {
    const args = process.argv.slice(2);
    const migrationFlag = args.find((arg) => arg.startsWith("--migration-mode"));

    if (!migrationFlag) {
      return false;
    }

    // Covers the case where the flag is --migration-mode [true|false|...]
    if (migrationFlag === "--migration-mode") {
      const nextArg = args[args.indexOf(migrationFlag) + 1];
      if (nextArg === "false") {
        return false;
      }
      // --migration-mode without a value defaults to true
      return nextArg === undefined || nextArg.toLowerCase() === "true";
    }

    // Covers the case where the flag is --migration-mode=[...]
    const [, value] = migrationFlag.split("=");
    if (value === undefined) {
      const nextArg = args[args.indexOf(migrationFlag) + 1];
      return nextArg === "true";
    }

    return value.toLowerCase() === "true";
  } catch (err) {
    logger.error(err, `Failed to check migration mode`);
    return false;
  }
};
