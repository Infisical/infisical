import { IdentityAuthMethod } from "@app/db/schemas";

export const buildAuthMethods = ({
  uaId,
  gcpId,
  awsId,
  kubernetesId,
  oidcId,
  azureId,
  tokenId
}: {
  uaId?: string;
  gcpId?: string;
  awsId?: string;
  kubernetesId?: string;
  oidcId?: string;
  azureId?: string;
  tokenId?: string;
}) => {
  return [
    ...(uaId ? [IdentityAuthMethod.UNIVERSAL_AUTH] : []),
    ...(gcpId ? [IdentityAuthMethod.GCP_AUTH] : []),
    ...(awsId ? [IdentityAuthMethod.AWS_AUTH] : []),
    ...(kubernetesId ? [IdentityAuthMethod.KUBERNETES_AUTH] : []),
    ...(oidcId ? [IdentityAuthMethod.OIDC_AUTH] : []),
    ...(azureId ? [IdentityAuthMethod.AZURE_AUTH] : []),
    ...(tokenId ? [IdentityAuthMethod.TOKEN_AUTH] : [])
  ].filter((authMethod) => authMethod);
};
