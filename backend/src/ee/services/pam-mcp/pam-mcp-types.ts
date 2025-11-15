export type TOauthRegisterClient = {
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  client_name: string;
  client_uri: string;
};
