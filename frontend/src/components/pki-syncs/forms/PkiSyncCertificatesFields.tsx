import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Pencil, ScrollText, Trash2 } from "lucide-react";

import {
  Button,
  Empty,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldError,
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
import { getCertificateDisplayName, truncateCertificateSerialNumber } from "@app/helpers/pkiSyncs";
import { CertStatus } from "@app/hooks/api";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

import { CertificateManagementModal } from "../CertificateManagementModal";
import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  applicationId?: string;
};

export const PkiSyncCertificatesFields = ({ applicationId }: Props = {}) => {
  const { control, watch, setValue } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);

  const certificateIds = watch("certificateIds") || [];

  const { data, isLoading } = useListWorkspaceCertificates({
    projectId: currentProject?.id || "",
    offset: 0,
    limit: 100,
    forPkiSync: true,
    applicationId
  });

  const certificates = data?.certificates || [];

  const activeCertificates = useMemo(
    () => certificates.filter((cert) => cert.status === CertStatus.ACTIVE),
    [certificates]
  );

  const selectedCertificates = useMemo(
    () => activeCertificates.filter((cert) => certificateIds.includes(cert.id)),
    [activeCertificates, certificateIds]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted">Loading certificates...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Controller
        control={control}
        name="certificateIds"
        render={({ field: { value = [], onChange }, fieldState: { error } }) => (
          <Field className="min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-end"
                onClick={() => setIsSelectionModalOpen(true)}
              >
                <Pencil className="size-3.5" />
                Add Certificates
              </Button>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {selectedCertificates.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">SAN / CN</TableHead>
                        <TableHead className="w-1/4">Serial Number</TableHead>
                        <TableHead className="w-1/6">Issued At</TableHead>
                        <TableHead className="w-1/6">Expires At</TableHead>
                        <TableHead className="w-12">Remove</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCertificates.map((cert) => {
                        const { originalDisplayName, displayName, isTruncated } =
                          getCertificateDisplayName(cert);
                        const truncatedSerial = truncateCertificateSerialNumber(cert.serialNumber);

                        const isExpired = new Date(cert.notAfter) < new Date();

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
                              <div
                                className="font-mono text-xs text-muted"
                                title={cert.serialNumber}
                              >
                                {truncatedSerial}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-0">
                              <span className="text-sm text-muted">
                                {new Date(cert.notBefore).toLocaleDateString()}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-0">
                              <span
                                className={`text-sm ${isExpired ? "text-danger" : "text-muted"}`}
                              >
                                {new Date(cert.notAfter).toLocaleDateString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label="Remove certificate"
                                onClick={() => {
                                  const newIds = value.filter((id: string) => id !== cert.id);
                                  onChange(newIds);
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty className="border py-8">
                    <EmptyMedia variant="icon">
                      <ScrollText />
                    </EmptyMedia>
                    <EmptyTitle>No certificates selected</EmptyTitle>
                  </Empty>
                )}
              </div>
            </div>
            <FieldError errors={[error]} />
          </Field>
        )}
      />

      <CertificateManagementModal
        isOpen={isSelectionModalOpen}
        onClose={() => setIsSelectionModalOpen(false)}
        destination={watch("destination")}
        applicationId={applicationId}
        selectedCertificateIds={certificateIds}
        onCertificateSelectionChange={(newCertificateIds) => {
          setValue("certificateIds", newCertificateIds);
        }}
        title="Select Certificates for Sync"
        subtitle="Choose which certificates you want to include in this sync. You can modify this selection after creating the sync."
        saveButtonText="Update Selection"
      />
    </div>
  );
};
