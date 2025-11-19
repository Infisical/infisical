import { TAwsSecretsManagerPkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
};

export const AwsSecretsManagerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const awsSecretsManagerPkiSync = pkiSync as TAwsSecretsManagerPkiSync;
  const { destinationConfig } = awsSecretsManagerPkiSync;

  return (
    <>
      <GenericFieldLabel label="AWS Region">
        {destinationConfig.region || "us-east-1"}
      </GenericFieldLabel>
      {destinationConfig.keyId && (
        <GenericFieldLabel label="KMS Key">{destinationConfig.keyId}</GenericFieldLabel>
      )}
    </>
  );
};
