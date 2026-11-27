import { TSamlConfigs } from "@app/db/schemas";
import { TOrgPermission } from "@app/lib/types";
import { TProviderAuthResult } from "@app/services/auth/auth-login-type";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TIdpMfaSignal } from "@app/services/auth/idp-mfa-signal";

export enum SamlProviders {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  GOOGLE_SAML = "google-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  AUTH0_SAML = "auth0-saml"
}

// Non-secret config fields recorded on create and update audit events.
export const SAML_CONFIG_AUDIT_FIELDS = [
  "authProvider",
  "isActive",
  "entryPoint",
  "issuer",
  "enableGroupSync",
  "mfaSignalAttribute",
  "mfaAuthnContexts",
  "mfaAttributeValues"
] as const;

export type TSamlConfigAuditFields = Pick<TCreateSamlCfgDTO, (typeof SAML_CONFIG_AUDIT_FIELDS)[number]>;

export type TCreateSamlCfgDTO = {
  authProvider: SamlProviders;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  idpCert: string;
  enableGroupSync?: boolean;
  mfaSignalAttribute?: string | null;
  mfaAuthnContexts?: string[] | null;
  mfaAttributeValues?: string[] | null;
} & TOrgPermission;

export type TUpdateSamlCfgDTO = Partial<{
  authProvider: SamlProviders;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  idpCert: string;
  enableGroupSync?: boolean;
  mfaSignalAttribute?: string | null;
  mfaAuthnContexts?: string[] | null;
  mfaAttributeValues?: string[] | null;
}> &
  TOrgPermission;

export type TDeleteSamlCfgDTO = TOrgPermission;

export type TGetSamlCfgDTO =
  | {
      type: "org";
      orgId: string;
      actor: ActorType;
      actorId: string;
      actorAuthMethod: ActorAuthMethod;
      actorOrgId: string;
    }
  | {
      type: "domain";
      domain: string;
    }
  | {
      type: "orgSlug";
      orgSlug: string;
    }
  | {
      type: "ssoId";
      id: string;
    };

export type TSamlLoginDTO = {
  externalId: string;
  email: string;
  firstName: string;
  lastName?: string;
  authProvider: string;
  orgId: string;
  ip: string;
  userAgent: string;
  // saml thingy
  callbackPort?: number;
  metadata?: { key: string; value: string }[];
  idpMfa?: TIdpMfaSignal;
};

export type TSamlConfigServiceFactory = {
  createSamlCfg: (arg: TCreateSamlCfgDTO) => Promise<TSamlConfigs & { organizationName: string }>;
  updateSamlCfg: (
    arg: TUpdateSamlCfgDTO
  ) => Promise<TSamlConfigs & { organizationName: string; ssoEnforcementDisabled: boolean }>;
  deleteSamlCfg: (arg: TDeleteSamlCfgDTO) => Promise<TSamlConfigs & { organizationName: string }>;
  getSaml: (arg: TGetSamlCfgDTO) => Promise<{
    id: string;
    organization: string;
    orgId: string;
    authProvider: string;
    isActive: boolean;
    entryPoint: string;
    issuer: string;
    cert: string;
    lastUsed: Date | null | undefined;
    enableGroupSync?: boolean;
    mfaSignalAttribute?: string | null;
    mfaAuthnContexts?: string[] | null;
    mfaAttributeValues?: string[] | null;
    acsUrl: string;
    spEntityId: string;
  }>;
  samlLogin: (arg: TSamlLoginDTO) => Promise<TProviderAuthResult & { userId: string; orgId: string; orgName: string }>;
  consumeSamlAssertion: (arg: { samlConfigId: string; parsedAssertion: unknown }) => Promise<void>;
};
