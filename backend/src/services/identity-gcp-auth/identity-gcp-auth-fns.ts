import { OAuth2Client } from "google-auth-library";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { UnauthorizedError } from "@app/lib/errors";

import { TDecodedGcpIamAuthJwt, TGcpIdTokenPayload } from "./identity-gcp-auth-types";

/**
 * Validates that the identity token [jwt] sent in from a client GCE instance as part of GCP ID Token authentication
 * is valid.
 * @param {string} identityId - The ID of the identity in Infisical that is being authenticated against (used as audience).
 * @param {string} jwt - The identity token to validate.
 * @param {string} credentials - The credentials in the GCP Auth configuration for Infisical.
 */
export const validateIdTokenIdentity = async ({
  identityId,
  jwt: identityToken
}: {
  identityId: string;
  jwt: string;
}) => {
  const oAuth2Client = new OAuth2Client();
  const response = await oAuth2Client.getFederatedSignonCerts();

  let payload: TGcpIdTokenPayload | undefined;
  try {
    const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(
      identityToken,
      response.certs,
      identityId, // audience
      ["https://accounts.google.com"]
    );
    payload = ticket.getPayload() as TGcpIdTokenPayload;
  } catch {
    // google-auth-library puts the whole token in its error messages, so the cause is dropped
    // rather than attached to an error that gets logged.
    throw new UnauthorizedError({ message: "Invalid GCP ID token" });
  }

  if (!payload || !payload.email) {
    throw new UnauthorizedError({ message: "GCP ID token is missing an email claim" });
  }

  return { email: payload.email, computeEngineDetails: payload.google?.compute_engine };
};

const serviceAccountEmailRegex = new RE2(/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/);

/**
 * Validates that the signed JWT token for a GCP service account is valid as part of GCP IAM authentication.
 * @param {string} identityId - The ID of the identity in Infisical that is being authenticated against (used as audience).
 * @param {string} jwt - The signed JWT token to validate.
 * @param {string} credentials - The credentials in the GCP Auth configuration for Infisical.
 * @returns
 */
export const validateIamIdentity = async ({
  identityId,
  jwt: serviceAccountJwt
}: {
  identityId: string;
  jwt: string;
}) => {
  let decodedJwt: TDecodedGcpIamAuthJwt;
  try {
    decodedJwt = crypto.jwt().decode(serviceAccountJwt, { complete: true }) as TDecodedGcpIamAuthJwt;
  } catch {
    throw new UnauthorizedError({ message: "Invalid GCP IAM token" });
  }
  if (!decodedJwt?.payload || !decodedJwt?.header?.kid) {
    throw new UnauthorizedError({ message: "Invalid GCP IAM token" });
  }
  const { sub, aud } = decodedJwt.payload;

  if (!sub || !serviceAccountEmailRegex.test(sub)) {
    throw new UnauthorizedError({ message: "Invalid service account identifier" });
  }

  const {
    data
  }: {
    data: {
      [key: string]: string;
    };
  } = await request.get(`https://www.googleapis.com/service_accounts/v1/metadata/x509/${encodeURIComponent(sub)}`);

  const publicKey = data[decodedJwt.header.kid];
  if (!publicKey) {
    throw new UnauthorizedError({ message: "No matching signing key found for the GCP IAM token" });
  }

  try {
    crypto.jwt().verify(serviceAccountJwt, publicKey, {
      algorithms: ["RS256"]
    });
  } catch {
    throw new UnauthorizedError({ message: "Invalid GCP IAM token signature" });
  }

  if (aud !== identityId) throw new UnauthorizedError({ message: "Invalid audience in GCP IAM Token" });
  return { email: sub };
};
