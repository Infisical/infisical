import snowflake from "snowflake-sdk";

import { BadRequestError } from "@app/lib/errors";

// The gateway answers Snowflake's REST API on the relay port and authenticates for the session
export const connectThroughRelay = async (relayPort: number, account: string): Promise<snowflake.Connection> => {
  const client = snowflake.createConnection({
    account,
    username: "pam",
    password: "pam",
    accessUrl: `http://127.0.0.1:${relayPort}`,
    application: "Infisical"
  });

  try {
    return await client.connectAsync();
  } catch (err) {
    client.destroy(() => {});
    throw new BadRequestError({
      message: `Unable to reach Snowflake through the gateway: ${(err as Error)?.message ?? "connection failed"}`
    });
  }
};
