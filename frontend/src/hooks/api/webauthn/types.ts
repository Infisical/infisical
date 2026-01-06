import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/browser";

export type TWebAuthnCredential = {
  id: string;
  credentialId: string;
  name?: string | null;
  transports?: string[] | null;
  createdAt: Date;
  lastUsedAt?: Date | null;
};

export type TGenerateRegistrationOptionsResponse = PublicKeyCredentialCreationOptionsJSON;

export type TVerifyRegistrationDTO = {
  registrationResponse: RegistrationResponseJSON;
  name?: string;
};

export type TGenerateAuthenticationOptionsResponse = PublicKeyCredentialRequestOptionsJSON;

export type TVerifyAuthenticationDTO = {
  authenticationResponse: AuthenticationResponseJSON;
};

export type TUpdateWebAuthnCredentialDTO = {
  id: string;
  name?: string;
};

export type TDeleteWebAuthnCredentialDTO = {
  id: string;
};
