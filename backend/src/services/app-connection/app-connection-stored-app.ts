import { AppConnection } from "./app-connection-enums";

// Redfish connections are still written as "hpe-ilo", the value earlier releases store and read, so rolling back to one
// of them leaves every connection readable. Reads also accept "redfish", so a later release can migrate the rows and
// still be rolled back to this one
const LEGACY_STORED_APP: Partial<Record<AppConnection, string>> = {
  [AppConnection.Redfish]: "hpe-ilo"
};

const APP_BY_LEGACY_STORED_APP: Record<string, AppConnection> = Object.fromEntries(
  Object.entries(LEGACY_STORED_APP).map(([app, storedApp]) => [storedApp, app as AppConnection])
);

export const toStoredAppConnectionApp = (app: string) => LEGACY_STORED_APP[app as AppConnection] ?? app;

export const getStoredAppConnectionAppValues = (app: string) => {
  const legacyStoredApp = LEGACY_STORED_APP[app as AppConnection];
  return legacyStoredApp ? [app, legacyStoredApp] : [app];
};

export const fromStoredAppConnectionApp = <T extends string | null | undefined>(storedApp: T): T =>
  (storedApp ? (APP_BY_LEGACY_STORED_APP[storedApp] ?? storedApp) : storedApp) as T;
