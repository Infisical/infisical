export type TSignOidcIssuerTokenDTO = {
  appConnection: { id: string; name: string; orgId: string; projectId?: string | null };
  audience: string;
  ttlSeconds?: number;
};

export type TSignDynamicSecretOidcTokenDTO = {
  dynamicSecret: { id: string; name: string };
  orgId: string;
  projectId: string;
  audience: string;
};
