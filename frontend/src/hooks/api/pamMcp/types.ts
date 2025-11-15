export type TSelectMcpScopeDTO = {
  response_type: string;
  client_id: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  scope: string;
  resource: string;
  projectId: string;
  state?: string;
};

export type TSelectMcpScopeResponse = {
  callbackUrl: string;
};
