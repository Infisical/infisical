import { useFormContext } from "react-hook-form";

import { Badge, GenericFieldLabel } from "@app/components/v2";
import { useProject } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { useListWorkspacePkiSubscribers } from "@app/hooks/api";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

export const PkiSyncReviewFields = () => {
  const { watch } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();

  const { data: pkiSubscribers = [] } = useListWorkspacePkiSubscribers(currentProject?.id || "");

  const getSubscriberName = (subscriberId?: string) => {
    const subscriber = pkiSubscribers.find((sub) => sub.id === subscriberId);
    return subscriber?.name || "Unknown";
  };

  const {
    name,
    description,
    connection,
    subscriberId,
    syncOptions,
    destination,
    destinationConfig,
    isAutoSyncEnabled
  } = watch();

  const destinationName = PKI_SYNC_MAP[destination].name;

  return (
    <div className="mb-4 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="border-mineshaft-600 w-full border-b">
          <span className="text-mineshaft-300 text-sm">Source</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="PKI Subscriber">
            {getSubscriberName(subscriberId)}
          </GenericFieldLabel>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="border-mineshaft-600 w-full border-b">
          <span className="text-mineshaft-300 text-sm">Destination</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Connection">{connection?.name}</GenericFieldLabel>
          <GenericFieldLabel label="Service">{destinationName}</GenericFieldLabel>
          {destinationConfig && "vaultBaseUrl" in destinationConfig && (
            <GenericFieldLabel label="Vault URL">
              {destinationConfig.vaultBaseUrl}
            </GenericFieldLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="border-mineshaft-600 w-full border-b">
          <span className="text-mineshaft-300 text-sm">Sync Options</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Auto-Sync">
            <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
              {isAutoSyncEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </GenericFieldLabel>
          {/* Hidden for now - Import certificates functionality disabled
          {syncOptions?.canImportCertificates !== undefined && (
            <GenericFieldLabel label="Import Certificates">
              <Badge variant={syncOptions.canImportCertificates ? "success" : "danger"}>
                {syncOptions.canImportCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </GenericFieldLabel>
          )}
          */}
          {syncOptions?.canRemoveCertificates !== undefined && (
            <GenericFieldLabel label="Remove Certificates">
              <Badge variant={syncOptions.canRemoveCertificates ? "success" : "danger"}>
                {syncOptions.canRemoveCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </GenericFieldLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="border-mineshaft-600 w-full border-b">
          <span className="text-mineshaft-300 text-sm">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Name">{name}</GenericFieldLabel>
          <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
