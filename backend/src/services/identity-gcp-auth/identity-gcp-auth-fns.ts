import { OAuth2Client } from "google-auth-library";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { UnauthorizedError } from "@app/lib/errors";

import { TDecodedGcpIamAuthJwt, TGcpIdTokenPayload } from "./identity-gcp-auth-types";

/**
 * Validates that the identity token [jwt] sent in from a client GCE instance as part of GCP ID Token authentication
 * is valid.
 * @param {string} audience - The Infisical-side ID the token must be bound to: an identity ID for machine
 * identity auth, a gateway ID for gateway GCP auth.
 * @param {string} jwt - The identity token to validate.
 */
export const validateIdTokenIdentity = async ({ audience, jwt: identityToken }: { audience: string; jwt: string }) => {
  const oAuth2Client = new OAuth2Client();
  const response = await oAuth2Client.getFederatedSignonCerts();
  const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(identityToken, response.certs, audience, [
    "https://accounts.google.com"
  ]);
  const payload = ticket.getPayload() as TGcpIdTokenPayload;
  if (!payload || !payload.email) throw new UnauthorizedError();

  return { email: payload.email, computeEngineDetails: payload.google?.compute_engine };
};

// A sanity check on `sub` before the certificate fetch, so it covers every Google SA domain.
const serviceAccountEmailRegex = new RE2(/^[a-z0-9][a-z0-9-]*@[a-z0-9][a-z0-9.-]*\.gserviceaccount\.com$/);

/**
 * Validates that the signed JWT token for a GCP service account is valid as part of GCP IAM authentication.
 * @param {string} audience - The Infisical-side ID the token must be bound to: an identity ID for machine
 * identity auth, a gateway ID for gateway GCP auth.
 * @param {string} jwt - The signed JWT token to validate.
 * @returns
 */
export const validateIamIdentity = async ({ audience, jwt: serviceAccountJwt }: { audience: string; jwt: string }) => {
  const decodedJwt = crypto.jwt().decode(serviceAccountJwt, { complete: true }) as TDecodedGcpIamAuthJwt;
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

  crypto.jwt().verify(serviceAccountJwt, publicKey, {
    algorithms: ["RS256"]
  });

  if (aud !== audience) throw new UnauthorizedError({ message: "Invalid audience in GCP IAM Token" });
  return { email: sub };
};
