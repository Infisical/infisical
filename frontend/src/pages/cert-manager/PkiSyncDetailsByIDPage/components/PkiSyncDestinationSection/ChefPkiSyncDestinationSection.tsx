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

export const ChefPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const dataBagName =
    pkiSync.destinationConfig && "dataBagName" in pkiSync.destinationConfig
      ? pkiSync.destinationConfig.dataBagName
      : undefined;

  return (
    <GenericFieldLabel label="Chef Data Bag Name">
      {dataBagName || "Not specified"}
    </GenericFieldLabel>
  );
};
