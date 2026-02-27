/* eslint-disable no-await-in-loop */
import { ChangeResourceRecordSetsCommand, Route53Client } from "@aws-sdk/client-route-53";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";

export const route53InsertTxtRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_WEST_1); // REGION is irrelevant because Route53 is global
  const route53Client = new Route53Client({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: config.credentials!,
    region: config.region
  });

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: "Set ACME challenge TXT record",
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: domain,
            Type: "TXT",
            TTL: 30,
            ResourceRecords: [{ Value: value }]
          }
        }
      ]
    }
  });

  await route53Client.send(command);
};

export const route53DeleteTxtRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_WEST_1); // REGION is irrelevant because Route53 is global
  const route53Client = new Route53Client({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: config.credentials!,
    region: config.region
  });

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: "Delete ACME challenge TXT record",
      Changes: [
        {
          Action: "DELETE",
          ResourceRecordSet: {
            Name: domain,
            Type: "TXT",
            TTL: 30,
            ResourceRecords: [{ Value: value }]
          }
        }
      ]
    }
  });

  // Retry with exponential backoff to handle propagation delay and transient errors
  const maxRetries = 3;
  const initialDelay = 3000;
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < maxRetries) {
    try {
      await route53Client.send(command);
      return;
    } catch (error) {
      lastError = error as Error;

      if (retryCount + 1 < maxRetries) {
        const delay = initialDelay * 2 ** retryCount;
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
      retryCount += 1;
    }
  }

  throw lastError ?? new Error("Failed to delete Route53 TXT record after retries");
};
