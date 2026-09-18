import { InternalServerError } from "@app/lib/errors";

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

  if (view.method === ResourceAuthMethodType.Token) {
    return { ...base, method: view.method, methodConfigId: resourceId };
  }

  // Legacy identity gateways cannot be created or have their method set, so reaching this is a bug.
  throw new InternalServerError({ message: `Cannot audit auth method "${view.method}" for a ${resourceType}` });
};
