import { afterAll, beforeAll, onTestFinished } from "vitest";

import type { TDbClient } from "@app/db";

import { createPlatformFactories, TPlatformFactories, TTenant } from "./factories";
import { openEmptyDatabase, openFreshDatabase, openWorkerDatabase, TEmptyDatabase, TOpenDatabase } from "./postgres";

export type TSetupIntegrationOptions = {
  // A private clone of the migrated database for this describe, for tests that change instance-wide state.
  freshDatabase?: boolean;
};

export type TIntegration = {
  /** Knex on this describe's database, with the Infisical schema migrated. */
  readonly db: TDbClient;
  readonly databaseName: string;
  /** Inserts for platform rows: user, organization, memberships, project. */
  readonly factories: TPlatformFactories;
  /** A new organization, an admin user and one project. Call it in every test that needs one. */
  newTenant(options?: Parameters<TPlatformFactories["tenant"]>[0]): Promise<TTenant>;
  /** An empty database on the same server, dropped when the test finishes. */
  newDatabase(): Promise<TEmptyDatabase>;
};

/**
 * Call inside a describe (or at the top of a file). Opens the database in beforeAll and closes it
 * in afterAll; read its values inside tests and hooks.
 */
export const setupIntegration = (options: TSetupIntegrationOptions = {}): TIntegration => {
  let opened: (TOpenDatabase & { factories: TPlatformFactories }) | undefined;

  beforeAll(async () => {
    const database = options.freshDatabase ? await openFreshDatabase() : await openWorkerDatabase();
    opened = { ...database, factories: createPlatformFactories(database.db) };
  });

  afterAll(async () => {
    await opened?.close();
    opened = undefined;
  });

  const current = () => {
    if (!opened) {
      throw new Error(
        "setupIntegration() is not ready: read h.db, h.factories and the rest inside a test or hook of the describe that called it, not while the describe is being declared"
      );
    }
    return opened;
  };

  return {
    get db() {
      return current().db;
    },
    get databaseName() {
      return current().name;
    },
    get factories() {
      return current().factories;
    },
    newTenant: (tenantOptions) => current().factories.tenant(tenantOptions),
    newDatabase: async () => {
      const database = await openEmptyDatabase(current().server);
      onTestFinished(() => database.close());
      return database;
    }
  };
};
