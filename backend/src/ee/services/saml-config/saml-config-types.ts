import { TSamlConfigs } from "@app/db/schemas";
import { TOrgPermission } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export enum SamlProviders {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  GOOGLE_SAML = "google-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  AUTH0_SAML = "auth0-saml"
}

export type TCreateSamlCfgDTO = {
  authProvider: SamlProviders;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  idpCert: string;
} & TOrgPermission;

export type TUpdateSamlCfgDTO = Partial<{
  authProvider: SamlProviders;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  idpCert: string;
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

export type TSamlConfigServiceFactory = {
  createSamlCfg: (arg: TCreateSamlCfgDTO) => Promise<TSamlConfigs>;
  updateSamlCfg: (arg: TUpdateSamlCfgDTO) => Promise<TSamlConfigs>;
  getSaml: (arg: TGetSamlCfgDTO) => Promise<
    | {
        id: string;
        organization: string;
        orgId: string;
        authProvider: string;
        isActive: boolean;
        entryPoint: string;
        issuer: string;
        cert: string;
        lastUsed: Date | null | undefined;
      }
    | undefined
  >;
  samlLogin: (arg: TSamlLoginDTO) => Promise<{
    isUserCompleted: boolean;
    providerAuthToken: string;
  }>;
};
