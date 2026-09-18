import { ResourceAuthMethodType } from "./resource-auth-method-fns";
import { TAuthMethodView } from "./resource-auth-method-types";

type TResourceAuthMethodAuditArg = {
  resourceType: "gateway" | "relay" | "kmip";
  resourceId: string;
  resourceName: string;
  view: TAuthMethodView;
};

export const resourceAuthMethodAuditMetadata = ({
  resourceType,
  resourceId,
  resourceName,
  view
}: TResourceAuthMethodAuditArg) => {
  const base = { resourceType, resourceId, resourceName };

  if (view.method === ResourceAuthMethodType.Aws) {
    return {
      ...base,
      method: view.method,
      methodConfigId: view.config.id,
      stsEndpoint: view.config.stsEndpoint,
      allowedPrincipalArns: view.config.allowedPrincipalArns,
      allowedAccountIds: view.config.allowedAccountIds
    };
  }

  if (view.method === ResourceAuthMethodType.Gcp) {
    return {
      ...base,
      method: view.method,
      methodConfigId: view.config.id,
      gcpAuthType: view.config.type,
      allowedServiceAccounts: view.config.allowedServiceAccounts,
      allowedProjects: view.config.allowedProjects,
      allowedZones: view.config.allowedZones
    };
  }

  if (view.method === ResourceAuthMethodType.Kubernetes) {
    return {
      ...base,
      method: view.method,
      methodConfigId: view.config.id,
      kubernetesHost: view.config.kubernetesHost,
      allowedNamespaces: view.config.allowedNamespaces,
      allowedNames: view.config.allowedNames,
      allowedAudience: view.config.allowedAudience
    };
  }

  // Naming the remaining methods keeps a new one from silently landing here with no audit fields.
  const methodWithoutConfig: typeof ResourceAuthMethodType.Token | typeof ResourceAuthMethodType.Identity = view.method;
  return { ...base, method: methodWithoutConfig, methodConfigId: resourceId };
};
