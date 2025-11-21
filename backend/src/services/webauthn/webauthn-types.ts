import { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

export type TGenerateRegistrationOptionsDTO = {
  userId: string;
};

export type TVerifyRegistrationResponseDTO = {
  userId: string;
  registrationResponse: RegistrationResponseJSON;
  name?: string; // User-friendly name for the credential
};

export type TGenerateAuthenticationOptionsDTO = {
  userId: string;
};

export type TVerifyAuthenticationResponseDTO = {
  userId: string;
  authenticationResponse: AuthenticationResponseJSON;
};

export type TGetUserWebAuthnCredentialsDTO = {
  userId: string;
};

export type TDeleteWebAuthnCredentialDTO = {
  userId: string;
  id: string;
};

export type TUpdateWebAuthnCredentialDTO = {
  userId: string;
  id: string;
  name?: string;
};
