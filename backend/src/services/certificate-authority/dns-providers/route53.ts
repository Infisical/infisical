import {
  ChangeResourceRecordSetsCommand,
  GetHostedZoneCommand,
  ListResourceRecordSetsCommand,
  Route53Client
} from "@aws-sdk/client-route-53";

import { ProjectType } from "@app/db/schemas";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
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
  comment?: string;
};

const buildClient = async (connection: TAwsConnectionConfig, instanceConfigService: TInstanceConfigService) => {
  // Route 53 is a global service — the region passed here only affects the signer, not the data plane.
  // us-east-1 is AWS's canonical region for global services.
  const config = await getAwsConnectionConfig(
    { ...connection, projectType: ProjectType.CertificateManager },
    instanceConfigService,
    AWSRegion.US_EAST_1
  );
  return new Route53Client({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: config.credentials,
    region: config.region
  });
};

const changeRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  action: "UPSERT" | "DELETE",
  record: TRoute53Record,
  instanceConfigService: TInstanceConfigService
) => {
  const route53Client = await buildClient(connection, instanceConfigService);
  const defaultComment = `${action === "UPSERT" ? "Upsert" : "Delete"} ${record.type} record for ${record.name}`;
  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: record.comment ?? defaultComment,
      Changes: [
        {
          Action: action,
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

export const route53UpsertRecord = (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  record: TRoute53Record,
  instanceConfigService: TInstanceConfigService
) => changeRecord(connection, hostedZoneId, "UPSERT", record, instanceConfigService);

export const route53DeleteRecord = (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  record: TRoute53Record,
  instanceConfigService: TInstanceConfigService
) => changeRecord(connection, hostedZoneId, "DELETE", record, instanceConfigService);

export const route53GetHostedZone = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  instanceConfigService: TInstanceConfigService
) => {
  const route53Client = await buildClient(connection, instanceConfigService);
  return route53Client.send(new GetHostedZoneCommand({ Id: hostedZoneId }));
};

export const route53AppendTxtRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  record: { name: string; value: string; ttl: number },
  instanceConfigService: TInstanceConfigService
) => {
  const route53Client = await buildClient(connection, instanceConfigService);
  const { ResourceRecordSets } = await route53Client.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      StartRecordName: record.name,
      StartRecordType: "TXT",
      MaxItems: 1
    })
  );
  const existing = ResourceRecordSets?.find(
    (recordSet) => recordSet.Type === "TXT" && recordSet.Name?.toLowerCase() === `${record.name.toLowerCase()}.`
  );
  const existingValues = (existing?.ResourceRecords ?? []).flatMap((resourceRecord) =>
    resourceRecord.Value ? [resourceRecord.Value] : []
  );
  if (existingValues.includes(record.value)) return;

  await route53Client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Comment: `Upsert TXT record for ${record.name}`,
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: {
              Name: record.name,
              Type: "TXT",
              TTL: existing?.TTL ?? record.ttl,
              ResourceRecords: [...existingValues, record.value].map((value) => ({ Value: value }))
            }
          }
        ]
      }
    })
  );
};
