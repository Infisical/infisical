import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TAwsSecretsManagerPkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const AwsSecretsManagerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const awsSecretsManagerPkiSync = pkiSync as TAwsSecretsManagerPkiSync;
  const { destinationConfig } = awsSecretsManagerPkiSync;

  return (
    <>
      <Detail>
        <DetailLabel>AWS Region</DetailLabel>
        <DetailValue>{destinationConfig.region || "us-east-1"}</DetailValue>
      </Detail>
      {destinationConfig.keyId && (
        <Detail>
          <DetailLabel>KMS Key</DetailLabel>
          <DetailValue>{destinationConfig.keyId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
