export type TSignOidcIssuerTokenDTO = {
  appConnection: { id: string; name: string; orgId: string; projectId?: string | null };
  audience: string;
};
