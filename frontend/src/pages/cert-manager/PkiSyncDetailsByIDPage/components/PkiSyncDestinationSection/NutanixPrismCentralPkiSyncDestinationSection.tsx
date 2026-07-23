import { TNutanixPrismCentralPkiSync } from "@app/hooks/api/pkiSyncs/types/nutanix-prism-central-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TNutanixPrismCentralPkiSync;
};

export const NutanixPrismCentralPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { clusterName, clusterId } = pkiSync.destinationConfig;

  return (
    <>
      <GenericFieldLabel label="Cluster Name">{clusterName}</GenericFieldLabel>
      <GenericFieldLabel label="Cluster ID">{clusterId}</GenericFieldLabel>
    </>
  );
};
