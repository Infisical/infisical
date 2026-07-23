import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  getCertificateDisplayName,
  PKI_SYNC_MAP,
  truncateCertificateSerialNumber
} from "@app/helpers/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

const ReviewFieldLabel = ({ label, children }: { label: string; children?: ReactNode }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium text-muted">{label}</p>
    {children ? (
      <p className="text-sm break-words text-foreground">{children}</p>
    ) : (
      <p className="text-sm text-muted/50 italic">None</p>
    )}
  </div>
);

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
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Certificates</span>
        </div>
        <div className="w-full">
          {selectedCertificates.length === 0 ? (
            <span className="text-sm text-muted/50 italic">No certificates selected</span>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">SAN / CN</TableHead>
                  <TableHead className="w-1/4">Serial Number</TableHead>
                  <TableHead className="w-1/4">Expires At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCertificates.map((cert) => {
                  const { originalDisplayName, displayName, isTruncated } =
                    getCertificateDisplayName(cert);
                  const truncatedSerial = truncateCertificateSerialNumber(cert.serialNumber);

                  return (
                    <TableRow key={cert.id}>
                      <TableCell className="max-w-0">
                        {isTruncated ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate">{displayName}</div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-lg">
                              {originalDisplayName}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="truncate">{displayName}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-0">
                        <div className="font-mono text-xs text-muted" title={cert.serialNumber}>
                          {truncatedSerial}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <span className="text-sm text-muted">
                          {new Date(cert.notAfter).toLocaleDateString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Destination</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <ReviewFieldLabel label="Connection">{connection?.name}</ReviewFieldLabel>
          <ReviewFieldLabel label="Service">{destinationName}</ReviewFieldLabel>
          {destinationConfig && "vaultBaseUrl" in destinationConfig && (
            <ReviewFieldLabel label="Vault URL">{destinationConfig.vaultBaseUrl}</ReviewFieldLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Sync Options</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <ReviewFieldLabel label="Auto-Sync">
            <div className="mt-1">
              <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
                {isAutoSyncEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </ReviewFieldLabel>
          {syncOptions?.canRemoveCertificates !== undefined && (
            <ReviewFieldLabel label="Remove Certificates">
              <div className="mt-1">
                <Badge variant={syncOptions.canRemoveCertificates ? "success" : "danger"}>
                  {syncOptions.canRemoveCertificates ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </ReviewFieldLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <ReviewFieldLabel label="Name">{name}</ReviewFieldLabel>
          <ReviewFieldLabel label="Description">{description}</ReviewFieldLabel>
        </div>
      </div>
    </div>
  );
};
