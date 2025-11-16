import { z } from "zod";

import {
  McpAccountCredentialsSchema,
  McpAccountSchema,
  McpResourceConnectionDetailsSchema,
  McpResourceSchema
} from "./mcp-resource-schemas";

export type TOAuthAuthorizationServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  response_modes_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  revocation_endpoint: string;
  code_challenge_methods_supported: string[];
};

export type TOAuthDynamicClientMetadata = {
  client_id: string;
  redirect_uris: string[];
  client_name: string;
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: "none" | "client_secret_basic" | "client_secret_post" | "private_key_jwt";
  registration_client_uri: string;
  client_id_issued_at: number;
};

export type TOAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
};

// Resources
export type TMcpResource = z.infer<typeof McpResourceSchema>;
export type TMcpResourceConnectionDetails = z.infer<typeof McpResourceConnectionDetailsSchema>;

// Accounts
export type TMcpAccount = z.infer<typeof McpAccountSchema>;
export type TMcpAccountCredentials = z.infer<typeof McpAccountCredentialsSchema>;
