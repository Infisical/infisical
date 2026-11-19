import { OAuth2Client } from "google-auth-library";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { UnauthorizedError } from "@app/lib/errors";

import { TDecodedGcpIamAuthJwt, TGcpIdTokenPayload } from "./identity-gcp-auth-types";

// A list like "," is not empty as a string but names nothing, so count entries rather than characters.
const hasListEntry = (list?: string | null) => Boolean(list?.split(",").some((entry) => entry.trim()));

// Zones are shared by every GCP customer, so a zone alone does not tie the identity to an owner. A project
// does, because a project ID belongs to one customer. Zones can only narrow a service account or project.
export const hasGcpTrustBinding = ({
  type,
  allowedServiceAccounts,
  allowedProjects
}: {
  type: string;
  allowedServiceAccounts?: string | null;
  allowedProjects?: string | null;
}) => {
  if (hasListEntry(allowedServiceAccounts)) return true;
  if (type === "iam") return false;
  return hasListEntry(allowedProjects);
};

export const GCP_TRUST_BINDING_REQUIRED_MESSAGE =
  "Configure at least one allowed GCP service account, or for GCE identities an allowed project.";

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

  let payload: TGcpIdTokenPayload | undefined;
  try {
    const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(identityToken, response.certs, audience, [
      "https://accounts.google.com"
    ]);
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

  if (aud !== audience) throw new UnauthorizedError({ message: "Invalid audience in GCP IAM Token" });
  return { email: sub };
};
