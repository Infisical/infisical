import { ChangeResourceRecordSetsCommand, GetHostedZoneCommand, Route53Client } from "@aws-sdk/client-route-53";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";

export type TRoute53Record = {
  name: string;
  type: "CNAME" | "TXT" | "A" | "AAAA";
  value: string;
  ttl?: number;
};

const buildClient = async (connection: TAwsConnectionConfig) => {
  // Route 53 is a global service — the region passed here only affects the signer, not the data plane.
  // us-east-1 is AWS's canonical region for global services.
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_EAST_1);
  return new Route53Client({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: config.credentials,
    region: config.region
  });
};

export const route53UpsertRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  record: TRoute53Record
) => {
  const route53Client = await buildClient(connection);

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: `Upsert ${record.type} record for ${record.name}`,
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: record.name,
            Type: record.type,
            TTL: record.ttl ?? 300,
            ResourceRecords: [{ Value: record.value }]
          }
        }
      ]
    }
  });

  await route53Client.send(command);
};

export const route53GetHostedZone = async (connection: TAwsConnectionConfig, hostedZoneId: string) => {
  const route53Client = await buildClient(connection);
  await route53Client.send(new GetHostedZoneCommand({ Id: hostedZoneId }));
};
