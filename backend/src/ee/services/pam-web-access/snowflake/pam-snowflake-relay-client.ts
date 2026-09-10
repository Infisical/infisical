import snowflake from "snowflake-sdk";

import { BadRequestError } from "@app/lib/errors";

const STATEMENT_TIMEOUT_MS = 30 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 30 * 1000;

// The gateway answers Snowflake's REST API on the relay port and authenticates for the session
export const connectThroughRelay = async (relayPort: number, account: string): Promise<snowflake.Connection> => {
  const client = snowflake.createConnection({
    account,
    username: "pam",
    password: "pam",
    accessUrl: `http://127.0.0.1:${relayPort}`,
    application: "Infisical",
    timeout: STATEMENT_TIMEOUT_MS
  });

  let loginTimer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      client.connectAsync(),
      new Promise<never>((_, reject) => {
        loginTimer = setTimeout(() => reject(new Error("timed out")), LOGIN_TIMEOUT_MS);
      })
    ]);
  } catch (err) {
    client.destroy(() => {});
    throw new BadRequestError({
      message: `Unable to reach Snowflake through the gateway: ${(err as Error)?.message ?? "connection failed"}`
    });
  } finally {
    clearTimeout(loginTimer);
  }
};
