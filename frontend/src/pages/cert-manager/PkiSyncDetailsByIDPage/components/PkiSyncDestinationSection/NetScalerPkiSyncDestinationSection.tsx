/* eslint-disable jsx-a11y/label-has-associated-control */
import { TNetScalerPkiSync } from "@app/hooks/api/pkiSyncs/types/netscaler-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TNetScalerPkiSync;
};

export const NetScalerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  if (!pkiSync.destinationConfig.vserverName) {
    return null;
  }

  return (
    <GenericFieldLabel label="SSL vServer Name">
      {pkiSync.destinationConfig.vserverName}
    </GenericFieldLabel>
  );
};
