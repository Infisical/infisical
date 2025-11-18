import { TUsers } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

export type TOauthRegisterClient = {
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  client_name: string;
  client_uri: string;
};

export type TOauthAuthorizeClient = {
  clientId: string;
  state?: string;
};

export type TOauthAuthorizeClientScope = {
  permission: OrgServiceActor;
  responseType: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  redirectUri: string;
  resource: string;
  projectId: string;
  tokenId: string;
  path?: string;
  expiry: string;
  userInfo: TUsers;
  userIp: string;
  userAgent: string;
};

export type TOauthTokenExchangeDTO =
  | {
      grant_type: "authorization_code";
      client_id: string;
      code: string;
      code_verifier: string;
      redirect_uri: string;
    }
  | {
      grant_type: "refresh_token";
      refresh_token: string;
    };
