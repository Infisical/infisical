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
  BOOLEAN_SYNC_OPTION_FIELDS,
  getCertificateDisplayName,
  PKI_SYNC_MAP,
  truncateCertificateSerialNumber,
  VALUE_SYNC_OPTION_FIELDS
} from "@app/helpers/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

const ReviewFieldLabel = ({ label, children }: { label: string; children?: ReactNode }) => (
  <div className="flex h-full min-w-0 flex-col justify-between gap-1">
    <p className="text-xs font-medium text-muted">{label}</p>
    {children ? (
      <div className="text-sm break-words text-foreground">{children}</div>
    ) : (
      <div className="text-sm text-muted/50 italic">None</div>
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
                  <TableHead>SAN / CN</TableHead>
                  <TableHead className="w-1/5">Serial Number</TableHead>
                  <TableHead className="w-1/6">Issued At</TableHead>
                  <TableHead className="w-1/6 pr-5">Expires At</TableHead>
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
                        <div className="font-mono text-xs" title={cert.serialNumber}>
                          {truncatedSerial}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <span className="text-sm">
                          {new Date(cert.notBefore).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 pr-5">
                        <span className="text-sm">
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
        <div className="grid grid-cols-3 gap-x-8 gap-y-4">
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
        <div className="grid grid-cols-3 gap-x-8 gap-y-4">
          <ReviewFieldLabel label="Auto-Sync">
            <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
              {isAutoSyncEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </ReviewFieldLabel>
          {BOOLEAN_SYNC_OPTION_FIELDS.map(({ key, label }) => {
            const optionValue = (syncOptions as Record<string, unknown> | undefined)?.[key];
            if (typeof optionValue !== "boolean") return null;
            return (
              <ReviewFieldLabel key={key} label={label}>
                <Badge variant={optionValue ? "success" : "danger"}>
                  {optionValue ? "Enabled" : "Disabled"}
                </Badge>
              </ReviewFieldLabel>
            );
          })}
          {VALUE_SYNC_OPTION_FIELDS.map(({ key, label }) => {
            const optionValue = (syncOptions as Record<string, unknown> | undefined)?.[key];
            if (optionValue === undefined || optionValue === null || optionValue === "")
              return null;
            return (
              <ReviewFieldLabel key={key} label={label}>
                <Badge variant="neutral">{String(optionValue)}</Badge>
              </ReviewFieldLabel>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Details</span>
        </div>
        <div className="grid grid-cols-3 gap-x-8 gap-y-4">
          <ReviewFieldLabel label="Name">{name}</ReviewFieldLabel>
          <ReviewFieldLabel label="Description">{description}</ReviewFieldLabel>
        </div>
      </div>
    </div>
  );
};
