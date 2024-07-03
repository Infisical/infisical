export const isMigrationMode = () => {
  const args = process.argv.slice(2);
  const migrationMode = args.find((arg) => arg === "migration:latest");

  if (migrationMode) {
    return true;
  }
  return false;
};
