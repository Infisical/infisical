import {
  AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TUserDALFactory } from "../user/user-dal";
import { TWebAuthnCredentialDALFactory } from "./webauthn-credential-dal";
import { verifyCredentialOwnership } from "./webauthn-fns";
import {
  TDeleteWebAuthnCredentialDTO,
  TGenerateAuthenticationOptionsDTO,
  TGenerateRegistrationOptionsDTO,
  TGetUserWebAuthnCredentialsDTO,
  TUpdateWebAuthnCredentialDTO,
  TVerifyAuthenticationResponseDTO,
  TVerifyRegistrationResponseDTO
} from "./webauthn-types";

type TWebAuthnServiceFactoryDep = {
  userDAL: TUserDALFactory;
  webAuthnCredentialDAL: TWebAuthnCredentialDALFactory;
  tokenService: TAuthTokenServiceFactory;
};

export type TWebAuthnServiceFactory = ReturnType<typeof webAuthnServiceFactory>;

// In-memory challenge storage (for development)
// TODO: In production, use Redis or database with TTL
const challengeStore = new Map<string, { challenge: string; timestamp: number }>();
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

const storeChallenge = (userId: string, challenge: string) => {
  challengeStore.set(userId, { challenge, timestamp: Date.now() });

  // Cleanup expired challenges
  for (const [key, value] of challengeStore.entries()) {
    if (Date.now() - value.timestamp > CHALLENGE_TTL) {
      challengeStore.delete(key);
    }
  }
};

const getChallenge = (userId: string): string | null => {
  const stored = challengeStore.get(userId);
  if (!stored) return null;

  // Check if expired
  if (Date.now() - stored.timestamp > CHALLENGE_TTL) {
    challengeStore.delete(userId);
    return null;
  }

  return stored.challenge;
};

const clearChallenge = (userId: string) => {
  challengeStore.delete(userId);
};

export const webAuthnServiceFactory = ({
  userDAL,
  webAuthnCredentialDAL,
  tokenService
}: TWebAuthnServiceFactoryDep) => {
  const appCfg = getConfig();

  // Relying Party (RP) information - extracted from SITE_URL
  const RP_NAME = "Infisical";
  const RP_ID = new URL(appCfg.SITE_URL || "http://localhost:8080").hostname;
  const ORIGIN = appCfg.SITE_URL || "http://localhost:8080";
  /**
   * Generate registration options for a new passkey
   * This is the first step in passkey registration
   */
  const generateRegistrationOptionsForUser = async ({ userId }: TGenerateRegistrationOptionsDTO) => {
    const user = await userDAL.findById(userId);

    if (!user) {
      throw new NotFoundError({
        message: "User not found"
      });
    }

    // Get existing credentials to exclude them from registration
    const existingCredentials = await webAuthnCredentialDAL.find({ userId });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(userId, "utf-8"),
      userName: user.email || "",
      userDisplayName: user.email || "",
      attestationType: "none",
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[]
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        requireResidentKey: true,
        residentKey: "required",
        userVerification: "required"
      }
    });

    // Store challenge for verification
    storeChallenge(userId, options.challenge);

    return options;
  };

  /**
   * Verify registration response and store the credential
   * This is the second step in passkey registration
   */
  const verifyRegistrationResponseFromUser = async ({
    userId,
    registrationResponse,
    name
  }: TVerifyRegistrationResponseDTO) => {
    const user = await userDAL.findById(userId);

    if (!user) {
      throw new NotFoundError({
        message: "User not found"
      });
    }

    // Retrieve the stored challenge
    const expectedChallenge = getChallenge(userId);
    if (!expectedChallenge) {
      throw new BadRequestError({
        message: "Challenge not found or expired. Please try registering again."
      });
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true
      });
    } catch (error: unknown) {
      clearChallenge(userId);
      throw new BadRequestError({
        message: `Registration verification failed: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    if (!verification.verified || !verification.registrationInfo) {
      clearChallenge(userId);
      throw new BadRequestError({
        message: "Registration verification failed"
      });
    }

    const { credential: registeredCredential } = verification.registrationInfo;

    // Check if credential already exists
    const credentialIdBase64 = registeredCredential.id;
    const existingCredential = await webAuthnCredentialDAL.findOne({
      credentialId: credentialIdBase64
    });

    if (existingCredential) {
      clearChallenge(userId);
      throw new BadRequestError({
        message: "This credential has already been registered"
      });
    }

    // Store the credential
    const credential = await webAuthnCredentialDAL.create({
      userId,
      credentialId: credentialIdBase64,
      publicKey: Buffer.from(registeredCredential.publicKey).toString("base64url"),
      counter: registeredCredential.counter,
      transports: registrationResponse.response.transports || null,
      name: name || "Passkey"
    });

    // Clear the challenge
    clearChallenge(userId);

    return {
      credentialId: credential.credentialId,
      name: credential.name
    };
  };

  /**
   * Generate authentication options for passkey verification
   * This is used during login/2FA
   */
  const generateAuthenticationOptionsForUser = async ({ userId }: TGenerateAuthenticationOptionsDTO) => {
    const credentials = await webAuthnCredentialDAL.find({ userId });

    if (credentials.length === 0) {
      throw new NotFoundError({
        message: "No passkeys registered for this user"
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[]
      })),
      userVerification: "required"
    });

    // Store challenge for verification
    storeChallenge(userId, options.challenge);

    return options;
  };

  /**
   * Verify authentication response
   * This is used during login/2FA to verify the user's passkey
   */
  const verifyAuthenticationResponseFromUser = async ({
    userId,
    authenticationResponse
  }: TVerifyAuthenticationResponseDTO) => {
    const credentialIdBase64 = authenticationResponse.id;

    if (!credentialIdBase64) {
      throw new BadRequestError({
        message: "Invalid authentication response"
      });
    }

    // Find the credential
    const credential = await webAuthnCredentialDAL.findOne({ credentialId: credentialIdBase64 });

    if (!credential) {
      throw new NotFoundError({
        message: "Credential not found"
      });
    }

    // Verify the credential belongs to the user
    if (!verifyCredentialOwnership(userId, credential.userId)) {
      throw new ForbiddenRequestError({
        message: "Credential does not belong to this user"
      });
    }

    // Retrieve the stored challenge
    const expectedChallenge = getChallenge(userId);
    if (!expectedChallenge) {
      throw new BadRequestError({
        message: "Challenge not found or expired. Please try authenticating again."
      });
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, "base64url"),
          counter: credential.counter
        },
        requireUserVerification: true
      });
    } catch (error: unknown) {
      clearChallenge(userId);
      throw new BadRequestError({
        message: `Authentication verification failed: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    if (!verification.verified) {
      clearChallenge(userId);
      throw new BadRequestError({
        message: "Authentication verification failed"
      });
    }

    // Update last used timestamp and counter
    await webAuthnCredentialDAL.updateById(credential.id, {
      lastUsedAt: new Date(),
      counter: verification.authenticationInfo.newCounter
    });

    // Clear the challenge
    clearChallenge(userId);

    // Generate one-time WebAuthn session token with 60-second expiration
    const sessionToken = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_WEBAUTHN_SESSION,
      userId
    });

    return {
      verified: true,
      credentialId: credential.credentialId,
      sessionToken
    };
  };

  /**
   * Get all WebAuthn credentials for a user
   */
  const getUserWebAuthnCredentials = async ({ userId }: TGetUserWebAuthnCredentialsDTO) => {
    const credentials = await webAuthnCredentialDAL.find({ userId });

    // Don't return sensitive data like public keys
    return credentials.map((cred) => ({
      id: cred.id,
      credentialId: cred.credentialId,
      name: cred.name,
      transports: cred.transports,
      createdAt: cred.createdAt,
      lastUsedAt: cred.lastUsedAt
    }));
  };

  /**
   * Delete a WebAuthn credential
   */
  const deleteWebAuthnCredential = async ({ userId, credentialId }: TDeleteWebAuthnCredentialDTO) => {
    const credential = await webAuthnCredentialDAL.findOne({ credentialId });

    if (!credential) {
      throw new NotFoundError({
        message: "Credential not found"
      });
    }

    if (!verifyCredentialOwnership(userId, credential.userId)) {
      throw new ForbiddenRequestError({
        message: "Credential does not belong to this user"
      });
    }

    await webAuthnCredentialDAL.deleteById(credential.id);

    return {
      success: true
    };
  };

  /**
   * Update a WebAuthn credential (e.g., rename it)
   */
  const updateWebAuthnCredential = async ({ userId, credentialId, name }: TUpdateWebAuthnCredentialDTO) => {
    const credential = await webAuthnCredentialDAL.findOne({ credentialId });

    if (!credential) {
      throw new NotFoundError({
        message: "Credential not found"
      });
    }

    if (!verifyCredentialOwnership(userId, credential.userId)) {
      throw new ForbiddenRequestError({
        message: "Credential does not belong to this user"
      });
    }

    const updatedCredential = await webAuthnCredentialDAL.updateById(credential.id, {
      name: name || credential.name
    });

    return {
      id: updatedCredential.id,
      credentialId: updatedCredential.credentialId,
      name: updatedCredential.name
    };
  };

  return {
    generateRegistrationOptions: generateRegistrationOptionsForUser,
    verifyRegistrationResponse: verifyRegistrationResponseFromUser,
    generateAuthenticationOptions: generateAuthenticationOptionsForUser,
    verifyAuthenticationResponse: verifyAuthenticationResponseFromUser,
    getUserWebAuthnCredentials,
    deleteWebAuthnCredential,
    updateWebAuthnCredential
  };
};
