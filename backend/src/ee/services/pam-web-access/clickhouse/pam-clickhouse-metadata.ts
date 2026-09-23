import { type OneShotOptions } from "../pam-data-explorer-session-handler";
import { verifyRelayReachable, withOneShotClient } from "./pam-clickhouse-client";
import { SCHEMAS_QUERY, TABLES_QUERY } from "./pam-clickhouse-data-explorer-metadata";

const relayTarget = (opts: OneShotOptions) => ({ relayPort: opts.relayPort, database: opts.database });

export const fetchSchemasOneShot = (opts: OneShotOptions): Promise<{ name: string }[]> =>
  withOneShotClient(relayTarget(opts), async (client) => {
    const result = await client.query({ query: SCHEMAS_QUERY, format: "JSON" });
    return (await result.json<{ name: string }>()).data;
  });

export const fetchTablesOneShot = (
  opts: OneShotOptions,
  schema: string
): Promise<{ name: string; tableType: string }[]> =>
  withOneShotClient(relayTarget(opts), async (client) => {
    const result = await client.query({
      query: TABLES_QUERY,
      format: "JSON",
      query_params: { schema }
    });
    return (await result.json<{ name: string; tableType: string }>()).data;
  });

export const verifyReachabilityOneShot = (opts: OneShotOptions): Promise<void> =>
  verifyRelayReachable(relayTarget(opts));
