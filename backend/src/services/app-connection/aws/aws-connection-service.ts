import AWS from "aws-sdk";

import { OrgServiceActor } from "@app/lib/types";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import {
  TListAwsConnectionIamUsers,
  TListAwsConnectionKmsKeys,
  TListAwsConnectionListeners,
  TListAwsConnectionLoadBalancers
} from "@app/services/app-connection/app-connection-types";
import { AwsLoadBalancerType } from "@app/services/app-connection/aws/aws-connection-enums";
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

export type TAwsLoadBalancerInfo = {
  loadBalancerArn: string;
  loadBalancerName: string;
  type: AwsLoadBalancerType;
  scheme: string;
  state: string;
  vpcId?: string;
  dnsName?: string;
};

export type TAwsListenerInfo = {
  listenerArn: string;
  port: number;
  protocol: string;
  loadBalancerArn: string;
  sslPolicy?: string;
  certificates?: Array<{
    certificateArn: string;
    isDefault: boolean;
  }>;
};

const listAwsLoadBalancers = async (
  appConnection: TAwsConnection,
  { region }: { region: AWSRegion }
): Promise<TAwsLoadBalancerInfo[]> => {
  const { credentials } = await getAwsConnectionConfig(appConnection, region);

  const elbClient = new AWS.ELBv2({
    credentials,
    region
  });

  const loadBalancers: TAwsLoadBalancerInfo[] = [];
  let marker: string | undefined;

  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await elbClient
      .describeLoadBalancers({
        Marker: marker
      })
      .promise();

    if (response.LoadBalancers) {
      for (const lb of response.LoadBalancers) {
        if (lb.LoadBalancerArn && lb.LoadBalancerName && lb.Type) {
          if (lb.Type === AwsLoadBalancerType.Application || lb.Type === AwsLoadBalancerType.Network) {
            loadBalancers.push({
              loadBalancerArn: lb.LoadBalancerArn,
              loadBalancerName: lb.LoadBalancerName,
              type: lb.Type as AwsLoadBalancerType,
              scheme: lb.Scheme || "unknown",
              state: lb.State?.Code || "unknown",
              vpcId: lb.VpcId,
              dnsName: lb.DNSName
            });
          }
        }
      }
    }

    marker = response.NextMarker;
  } while (marker);

  return loadBalancers;
};

const listAwsListeners = async (
  appConnection: TAwsConnection,
  { region, loadBalancerArn }: { region: AWSRegion; loadBalancerArn: string }
): Promise<TAwsListenerInfo[]> => {
  const { credentials } = await getAwsConnectionConfig(appConnection, region);

  const elbClient = new AWS.ELBv2({
    credentials,
    region
  });

  const listeners: TAwsListenerInfo[] = [];
  let marker: string | undefined;

  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await elbClient
      .describeListeners({
        LoadBalancerArn: loadBalancerArn,
        Marker: marker
      })
      .promise();

    if (response.Listeners) {
      for (const listener of response.Listeners) {
        if (
          listener.ListenerArn &&
          listener.Port &&
          listener.Protocol &&
          (listener.Protocol === "HTTPS" || listener.Protocol === "TLS")
        ) {
          listeners.push({
            listenerArn: listener.ListenerArn,
            port: listener.Port,
            protocol: listener.Protocol,
            loadBalancerArn,
            sslPolicy: listener.SslPolicy,
            certificates: listener.Certificates?.map((cert) => ({
              certificateArn: cert.CertificateArn || "",
              isDefault: cert.IsDefault || false
            }))
          });
        }
      }
    }

    marker = response.NextMarker;
  } while (marker);

  return listeners;
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

  const listLoadBalancers = async (
    { connectionId, region }: TListAwsConnectionLoadBalancers,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.AWS, connectionId, actor);

    const loadBalancers = await listAwsLoadBalancers(appConnection, { region });

    return loadBalancers;
  };

  const listListeners = async (
    { connectionId, region, loadBalancerArn }: TListAwsConnectionListeners,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.AWS, connectionId, actor);

    const listeners = await listAwsListeners(appConnection, { region, loadBalancerArn });

    return listeners;
  };

  return {
    listKmsKeys,
    listIamUsers,
    listLoadBalancers,
    listListeners
  };
};
