import axios from "axios";
import { OAuth2Client } from "google-auth-library";

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
  const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(
    identityToken,
    response.certs,
    identityId, // audience
    ["https://accounts.google.com"]
  );
  const payload = ticket.getPayload() as TGcpIdTokenPayload;
  if (!payload || !payload.email) throw new UnauthorizedError();

  return { email: payload.email, computeEngineDetails: payload.google?.compute_engine };
};

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
  const decodedJwt = crypto.jwt().decode(serviceAccountJwt, { complete: true }) as TDecodedGcpIamAuthJwt;
  const { sub, aud } = decodedJwt.payload;

  const {
    data
  }: {
    data: {
      [key: string]: string;
    };
  } = await axios.get(`https://www.googleapis.com/service_accounts/v1/metadata/x509/${sub}`);

  const publicKey = data[decodedJwt.header.kid];

  crypto.jwt().verify(serviceAccountJwt, publicKey, {
    algorithms: ["RS256"]
  });

  if (aud !== identityId) throw new UnauthorizedError({ message: "Invalid audience in GCP IAM Token" });
  return { email: sub };
};
