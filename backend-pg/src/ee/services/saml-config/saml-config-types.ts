import { TOrgPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

export enum SamlProviders {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml"
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
  | { type: "org"; orgId: string; actor: ActorType; actorId: string }
  | {
      type: "ssoId";
      id: string;
    };

export type TSamlLoginDTO = {
  email: string;
  firstName: string;
  lastName?: string;
  authProvider: string;
  orgId: string;
  isSignupAllowed: boolean;
  // saml thingy
  relayState?: string;
};
