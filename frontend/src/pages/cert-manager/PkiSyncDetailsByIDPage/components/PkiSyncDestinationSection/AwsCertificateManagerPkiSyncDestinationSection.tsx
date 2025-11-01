import { TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
};

export const AwsCertificateManagerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const region =
    pkiSync.destinationConfig && "region" in pkiSync.destinationConfig
      ? pkiSync.destinationConfig.region
      : undefined;

  return <GenericFieldLabel label="AWS Region">{region || "Not specified"}</GenericFieldLabel>;
};
