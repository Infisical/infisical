/* eslint-disable jsx-a11y/label-has-associated-control */
import { TKempLoadMasterPkiSync } from "@app/hooks/api/pkiSyncs/types/kemp-loadmaster-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TKempLoadMasterPkiSync;
};

export const KempLoadMasterPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  if (!pkiSync.destinationConfig.virtualServiceId) {
    return null;
  }

  return (
    <GenericFieldLabel label="Virtual Service">
      {pkiSync.destinationConfig.virtualServiceId}
    </GenericFieldLabel>
  );
};
