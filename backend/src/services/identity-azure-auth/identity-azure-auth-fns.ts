import axios from "axios";
import jwt from "jsonwebtoken";

import { UnauthorizedError } from "@app/lib/errors";

import { TAzureAuthJwtPayload, TAzureJwksUriResponse, TDecodedAzureAuthJwt } from "./identity-azure-auth-types";

export const validateAzureIdentity = async ({
  tenantId,
  resource,
  jwt: azureJwt
}: {
  tenantId: string;
  resource: string;
  jwt: string;
}) => {
  const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/keys`;

  const decodedJwt = jwt.decode(azureJwt, { complete: true }) as TDecodedAzureAuthJwt;

  const { kid } = decodedJwt.header;

  const { data }: { data: TAzureJwksUriResponse } = await axios.get(jwksUri);
  const signingKeys = data.keys;

  const signingKey = signingKeys.find((key) => key.kid === kid);
  if (!signingKey) throw new UnauthorizedError();

  const publicKey = `-----BEGIN CERTIFICATE-----\n${signingKey.x5c[0]}\n-----END CERTIFICATE-----`;

  // Case: This can happen when the user uses a custom resource (such as https://management.azure.com&client_id=value).
  // In this case, the audience in the decoded JWT will not have a trailing slash, but the resource will.
  if (!decodedJwt.payload.aud.endsWith("/") && resource.endsWith("/")) {
    // eslint-disable-next-line no-param-reassign
    resource = resource.slice(0, -1);
  }

  return jwt.verify(azureJwt, publicKey, {
    audience: resource,
    issuer: `https://sts.windows.net/${tenantId}/`
  }) as TAzureAuthJwtPayload;
};
