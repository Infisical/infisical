import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

export const PkiSyncReviewFields = () => {
  const { watch } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();

  const { data } = useListWorkspaceCertificates({
    projectId: currentProject?.id || "",
    offset: 0,
    limit: 100
  });

  const certificates = data?.certificates || [];

  const getSelectedCertificates = (certificateIds?: string[]) => {
    if (!certificateIds || certificateIds.length === 0) return [];
    return certificates.filter((cert) => certificateIds.includes(cert.id));
  };

  const {
    name,
    description,
    connection,
    certificateIds,
    syncOptions,
    destination,
    destinationConfig,
    isAutoSyncEnabled
  } = watch();

  const destinationName = PKI_SYNC_MAP[destination].name;
  const selectedCertificates = getSelectedCertificates(certificateIds);

  return (
    <div className="mb-4 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Certificates</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            {selectedCertificates.length === 0 ? (
              <span className="text-bunker-400">No certificates selected</span>
            ) : (
              <div className="space-y-1">
                {selectedCertificates.map((cert) => (
                  <div key={cert.id} className="text-sm">
                    {cert.commonName}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Destination</span>
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
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Sync Options</span>
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
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Name">{name}</GenericFieldLabel>
          <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
