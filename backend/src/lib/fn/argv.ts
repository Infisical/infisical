export const isMigrationMode = () => !!process.argv.slice(2).find((arg) => arg === "migration:latest"); // example -> ./binary migration:latest
