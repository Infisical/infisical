import axios from "axios";
import { JWTInput, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import jwt from "jsonwebtoken";

import { UnauthorizedError } from "@app/lib/errors";

import { TDecodedGcpIamAuthJwt, TGcpGceIdTokenPayload } from "./identity-gcp-auth-types";

/**
 * Return the full details of the service account corresponding to the service account email or unique ID [serviceAccount].
 * @param {string} serviceAccount - The email or unique ID of the service account.
 * @param {string} credentials - The credentials in the GCP Auth configuration for Infisical.
 * @returns
 */
const getGcpServiceAccountDetails = async (serviceAccount: string, credentials: string) => {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials) as JWTInput,
    scopes: ["https://www.googleapis.com/auth/iam"]
  });

  const iam = google.iam({
    version: "v1",
    auth
  });

  const { data } = await iam.projects.serviceAccounts.get({
    name: `projects/-/serviceAccounts/${serviceAccount}`
  });

  return data;
};

/**
 * Validates that the identity token [jwt] sent in from a client GCE instance as part of GCP GCE authentication
 * is valid.
 * @param {string} identityId - The ID of the identity in Infisical that is being authenticated against (used as audience).
 * @param {string} jwt - The identity token to validate.
 * @param {string} credentials - The credentials in the GCP Auth configuration for Infisical.
 */
export const validateGceIdentity = async ({
  identityId,
  jwt: identityToken,
  credentials
}: {
  identityId: string;
  jwt: string;
  credentials: string;
}) => {
  const oAuth2Client = new OAuth2Client();
  const response = await oAuth2Client.getFederatedSignonCerts();
  const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(
    identityToken,
    response.certs,
    identityId, // audience
    ["https://accounts.google.com"]
  );
  const payload = ticket.getPayload() as TGcpGceIdTokenPayload;
  if (!payload || !payload.email) throw new UnauthorizedError();
  const serviceAccountDetails = await getGcpServiceAccountDetails(payload.email, credentials);

  return { serviceAccountDetails, gceInstanceDetails: payload };
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
  jwt: serviceAccountJwt,
  credentials
}: {
  identityId: string;
  jwt: string;
  credentials: string;
}) => {
  const decodedJwt = jwt.decode(serviceAccountJwt, { complete: true }) as TDecodedGcpIamAuthJwt;
  const { sub, aud } = decodedJwt.payload;

  const {
    data
  }: {
    data: {
      [key: string]: string;
    };
  } = await axios.get(`https://www.googleapis.com/service_accounts/v1/metadata/x509/${sub}`);

  const publicKey = data[decodedJwt.header.kid];

  jwt.verify(serviceAccountJwt, publicKey, {
    algorithms: ["RS256"]
  });

  if (aud !== identityId) throw new UnauthorizedError();
  const serviceAccountDetails = await getGcpServiceAccountDetails(sub, credentials);
  return { serviceAccountDetails };
};
