import { ACMClient } from "@aws-sdk/client-acm";

import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";

export const createAcmClient = async ({
  appConnectionId,
  region,
  appConnectionDAL,
  kmsCoreDomain
}: {
  appConnectionId: string;
  region: AWSRegion;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsCoreDomain: TKmsCoreDomain;
}) => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
  }

  const decryptedConnection = (await decryptAppConnection(appConnection, kmsCoreDomain)) as TAwsConnection;
  const awsConfig = await getAwsConnectionConfig(decryptedConnection, region);

  return new ACMClient({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: awsConfig.credentials,
    region: awsConfig.region
  });
};

export const resolveDnsAwsConnection = async ({
  dnsAppConnectionId,
  appConnectionDAL,
  kmsCoreDomain
}: {
  dnsAppConnectionId: string;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsCoreDomain: TKmsCoreDomain;
}) => {
  const dnsAppConnection = await appConnectionDAL.findById(dnsAppConnectionId);
  if (!dnsAppConnection) {
    throw new NotFoundError({ message: `DNS app connection with ID '${dnsAppConnectionId}' not found` });
  }
  return (await decryptAppConnection(dnsAppConnection, kmsCoreDomain)) as TAwsConnection;
};
