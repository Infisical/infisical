import { TOrgPermission } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export enum SamlProviders {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  GOOGLE_SAML = "google-saml",
  KEYCLOAK_SAML = "keycloak-saml"
}

export type TCreateSamlCfgDTO = {
  authProvider: SamlProviders;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  cert: string;
} & TOrgPermission;

export type TUpdateSamlCfgDTO = Partial<{
  authProvider: SamlProviders;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  cert: string;
}> &
  TOrgPermission;

export type TGetSamlCfgDTO =
  | {
      type: "org";
      orgId: string;
      actor: ActorType;
      actorId: string;
      actorAuthMethod: ActorAuthMethod;
      actorOrgId: string | undefined;
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
  // saml thingy
  relayState?: string;
  metadata?: { key: string; value: string }[];
};
