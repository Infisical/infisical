import { TDbClient } from "@app/db";

import { ObservabilityResourceType, TResourceResolver } from "../observability-widget-types";
import { dynamicSecretResolverFactory } from "./dynamic-secret-resolver";
import { gatewayResolverFactory } from "./gateway-resolver";
import { machineIdentityTokenResolverFactory } from "./machine-identity-token-resolver";
import { machineIdentityUsageResolverFactory } from "./machine-identity-usage-resolver";
import { pamSessionResolverFactory } from "./pam-session-resolver";
import { pkiCertificateResolverFactory } from "./pki-certificate-resolver";
import { relayResolverFactory } from "./relay-resolver";
import { secretRotationResolverFactory } from "./secret-rotation-resolver";
import { secretSyncResolverFactory } from "./secret-sync-resolver";
import { serviceTokenResolverFactory } from "./service-token-resolver";
import { userSessionResolverFactory } from "./user-session-resolver";
import { webhookResolverFactory } from "./webhook-resolver";

export type TResolverRegistry = Record<ObservabilityResourceType, TResourceResolver>;

export const createResolverRegistry = (db: TDbClient): TResolverRegistry => {
  return {
    [ObservabilityResourceType.SecretSync]: secretSyncResolverFactory(db),
    [ObservabilityResourceType.SecretRotation]: secretRotationResolverFactory(db),
    [ObservabilityResourceType.DynamicSecretLease]: dynamicSecretResolverFactory(db),
    [ObservabilityResourceType.MachineIdentityToken]: machineIdentityTokenResolverFactory(db),
    [ObservabilityResourceType.ServiceToken]: serviceTokenResolverFactory(db),
    [ObservabilityResourceType.Webhook]: webhookResolverFactory(db),
    [ObservabilityResourceType.PamSession]: pamSessionResolverFactory(db),
    [ObservabilityResourceType.UserSession]: userSessionResolverFactory(db),
    [ObservabilityResourceType.Gateway]: gatewayResolverFactory(db),
    [ObservabilityResourceType.Relay]: relayResolverFactory(db),
    [ObservabilityResourceType.PkiCertificate]: pkiCertificateResolverFactory(db),
    [ObservabilityResourceType.MachineIdentityUsage]: machineIdentityUsageResolverFactory(db)
  };
};

export * from "./resolver-helpers";
