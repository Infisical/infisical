import { IdentityAuthMethod } from "@app/db/schemas";

export const buildAuthMethods = ({
  uaId,
  gcpId,
  awsId,
  kubernetesId,
  oidcId,
  azureId,
  tokenId,
  jwtId
}: {
  uaId?: string;
  gcpId?: string;
  awsId?: string;
  kubernetesId?: string;
  oidcId?: string;
  azureId?: string;
  tokenId?: string;
  jwtId?: string;
}) => {
  return [
    ...[uaId ? IdentityAuthMethod.UNIVERSAL_AUTH : null],
    ...[gcpId ? IdentityAuthMethod.GCP_AUTH : null],
    ...[awsId ? IdentityAuthMethod.AWS_AUTH : null],
    ...[kubernetesId ? IdentityAuthMethod.KUBERNETES_AUTH : null],
    ...[oidcId ? IdentityAuthMethod.OIDC_AUTH : null],
    ...[azureId ? IdentityAuthMethod.AZURE_AUTH : null],
    ...[tokenId ? IdentityAuthMethod.TOKEN_AUTH : null],
    ...[jwtId ? IdentityAuthMethod.JWT_AUTH : null]
  ].filter((authMethod) => authMethod) as IdentityAuthMethod[];
};
