import AWS from "aws-sdk";

import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TListAwsConnectionKmsKeys } from "@app/services/app-connection/app-connection-types";
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

  const { Aliases = [] } = await awsKms.listAliases({ Limit: 100 }).promise();

  const aliasEntries = Aliases.filter((aliasEntry) => {
    if (!aliasEntry.TargetKeyId) return false;

    if (destination === SecretSync.AWSParameterStore && aliasEntry.AliasName === "alias/aws/ssm") return true;

    if (destination === SecretSync.AWSSecretsManager && aliasEntry.AliasName === "alias/aws/secretsmanager")
      return true;

    if (aliasEntry.AliasName?.includes("alias/aws/")) return false;

    return true;
  });

  const kmsKeys = aliasEntries.map((alias) => {
    return {
      id: alias.TargetKeyId!,
      alias: alias.AliasName!
    };
  });

  return kmsKeys;
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

  return {
    listKmsKeys
  };
};
