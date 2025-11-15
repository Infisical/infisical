import crypto from "node:crypto";

import { z } from "zod";

import { TKeyStoreFactory } from "@app/keystore/keystore";

import { TPamMcpDALFactory } from "./pam-mcp-dal";
import { TOauthRegisterClient } from "./pam-mcp-types";

const DynamicClientInfoSchema = z.object({
  client_id: z.string(),
  redirect_uris: z.array(z.string()),
  client_name: z.string(),
  client_uri: z.string(),
  grant_types: z.array(z.string()),
  response_types: z.array(z.string()),
  token_endpoint_auth_method: z.string(),
  registration_client_uri: z.string(),
  client_id_issued_at: z.number()
});

type TPamMcpServiceFactoryDep = {
  // pamMcpDAL: TPamMcpDALFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem">;
};

export type TPamMcpServiceFactory = ReturnType<typeof pamMcpServiceFactory>;

export const pamMcpServiceFactory = ({ keyStore }: TPamMcpServiceFactoryDep) => {
  const oauthRegisterClient = async ({
    client_name,
    client_uri,
    grant_types,
    redirect_uris,
    response_types,
    token_endpoint_auth_method
  }: TOauthRegisterClient) => {
    const clientId = `mcp_client_${crypto.randomBytes(32).toString("hex")}`;
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      client_id: clientId,
      client_name,
      client_uri,
      grant_types,
      redirect_uris,
      response_types,
      token_endpoint_auth_method,
      client_id_issued_at: now
    };

    // TODO(pam-mcp): validate redirect uris
    await keyStore.setItemWithExpiry(clientId, 120, JSON.stringify(payload));
    return payload;
  };

  return { oauthRegisterClient };
};
