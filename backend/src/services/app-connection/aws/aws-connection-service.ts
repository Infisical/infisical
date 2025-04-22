import AWS from "aws-sdk";

import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  TListAwsConnectionIamUsers,
  TListAwsConnectionKmsKeys
} from "@app/services/app-connection/app-connection-types";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAwsConnection>;

const listAwsKmsKeys = async (
  appConnection: TAwsConnection,
  { region, destination }: Pick<TListAwsConnectionKmsKeys, "region" | "destination">
) => {
  const { credentials } = await getAwsConnectionConfig(appConnection, region);

  const awsKms = new AWS.KMS({
    credentials,
    region
  });

  const aliasEntries: AWS.KMS.AliasList = [];
  let aliasMarker: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await awsKms.listAliases({ Limit: 100, Marker: aliasMarker }).promise();
    aliasEntries.push(...(response.Aliases || []));
    aliasMarker = response.NextMarker;
  } while (aliasMarker);

  const keyMetadataRecord: Record<string, AWS.KMS.KeyMetadata | undefined> = {};
  for await (const aliasEntry of aliasEntries) {
    if (aliasEntry.TargetKeyId) {
      const keyDescription = await awsKms.describeKey({ KeyId: aliasEntry.TargetKeyId }).promise();

      keyMetadataRecord[aliasEntry.TargetKeyId] = keyDescription.KeyMetadata;
    }
  }

  const validAliasEntries = aliasEntries.filter((aliasEntry) => {
    if (!aliasEntry.TargetKeyId) return false;

    if (destination === SecretSync.AWSParameterStore && aliasEntry.AliasName === "alias/aws/ssm") return true;

    if (destination === SecretSync.AWSSecretsManager && aliasEntry.AliasName === "alias/aws/secretsmanager")
      return true;

    if (aliasEntry.AliasName?.includes("alias/aws/")) return false;

    const keyMetadata = keyMetadataRecord[aliasEntry.TargetKeyId];

    if (!keyMetadata || keyMetadata.KeyUsage !== "ENCRYPT_DECRYPT" || keyMetadata.KeySpec !== "SYMMETRIC_DEFAULT")
      return false;

    return true;
  });

  const kmsKeys = validAliasEntries.map((aliasEntry) => {
    return {
      id: aliasEntry.TargetKeyId!,
      alias: aliasEntry.AliasName!
    };
  });

  return kmsKeys;
};

const listAwsIamUsers = async (appConnection: TAwsConnection) => {
  const { credentials } = await getAwsConnectionConfig(appConnection);

  const iam = new AWS.IAM({ credentials });

  const userEntries: AWS.IAM.User[] = [];
  let userMarker: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await iam.listUsers({ MaxItems: 100, Marker: userMarker }).promise();
    userEntries.push(...(response.Users || []));
    userMarker = response.Marker;
  } while (userMarker);

  return userEntries;
};

export const awsConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listKmsKeys = async (
    { connectionId, region, destination }: TListAwsConnectionKmsKeys,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.AWS, connectionId, actor);

    const kmsKeys = await listAwsKmsKeys(appConnection, { region, destination });

    return kmsKeys;
  };

  const listIamUsers = async ({ connectionId }: TListAwsConnectionIamUsers, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.AWS, connectionId, actor);

    const iamUsers = await listAwsIamUsers(appConnection);

    return iamUsers;
  };

  return {
    listKmsKeys,
    listIamUsers
  };
};
