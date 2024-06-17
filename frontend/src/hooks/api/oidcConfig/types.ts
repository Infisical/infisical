export type OIDCConfigData = {
  id: string;
  issuer: string;
  authorizationEndpoint: string;
  jwksUri: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  isActive: boolean;
  orgId: string;
  clientId: string;
  clientSecret: string;
};
