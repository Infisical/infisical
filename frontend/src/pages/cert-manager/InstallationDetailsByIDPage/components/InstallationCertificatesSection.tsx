/* eslint-disable no-nested-ternary */
import { ReactNode, useState } from "react";
import { subject } from "@casl/ability";
import { format } from "date-fns";
import { BoxIcon, EyeIcon, FileOutputIcon, MoreHorizontalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { getInstancePinningLink } from "@app/helpers/project";
import { TPkiInstallationCert, useDownloadCertPkcs12 } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AssignCertificateToApplicationModal } from "../../CertificatesPage/components/AssignCertificateToApplicationModal";
import { CertificateCertModal } from "../../CertificatesPage/components/CertificateCertModal";
import {
  CertificateExportModal,
  ExportOptions
} from "../../CertificatesPage/components/CertificateExportModal";
import { getCertValidUntilBadgeDetails } from "../../CertificatesPage/components/CertificatesTable.utils";

type Props = {
  certificates: TPkiInstallationCert[];
  emptyState?: ReactNode;
};

export const InstallationCertificatesSection = ({ certificates, emptyState }: Props) => {
  const { currentProject } = useProject();
  const { permission, hasProjectRole } = useProjectPermission();
  const { mutateAsync: downloadCertPkcs12 } = useDownloadCertPkcs12();
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "certificateCert",
    "certificateExport"
  ] as const);

  const handleCertificateExport = async (
    exportFormat: "pem" | "pkcs12",
    { certificateId, serialNumber }: { certificateId: string; serialNumber: string },
    options?: ExportOptions
  ) => {
    if (exportFormat === "pem") {
      handlePopUpOpen("certificateCert", { serialNumber });
      return;
    }

    const pkcs12Options = options?.pkcs12;
    if (!pkcs12Options?.password || !pkcs12Options.alias) {
      createNotification({
        text: "Password and alias are required for PKCS12 export",
        type: "error"
      });
      return;
    }

    try {
      await downloadCertPkcs12({
        certificateId,
        ...pkcs12Options
      });
      createNotification({
        text: "PKCS12 certificate downloaded successfully",
        type: "success"
      });
    } catch (error: unknown) {
      createNotification({
        text: error instanceof Error ? error.message : "Failed to download PKCS12 certificate",
        type: "error"
      });
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Discovered Certificates</CardTitle>
        <CardDescription>Certificates found on this installation</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {certificates.length === 0 && emptyState ? (
          emptyState
        ) : certificates.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No certificates found on this installation</EmptyTitle>
              <EmptyDescription>Run a scan to discover certificates</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SAN / CN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((cert) => {
                const expiryDetails = cert.notAfter
                  ? getCertValidUntilBadgeDetails(cert.notAfter)
                  : null;
                const canReadCertificate = permission.can(
                  ProjectPermissionCertificateActions.Read,
                  subject(ProjectPermissionSub.Certificates, {
                    commonName: cert.commonName ?? undefined,
                    altNames: cert.altNames?.split(",").map((s) => s.trim()),
                    serialNumber: cert.serialNumber ?? undefined,
                    friendlyName: cert.friendlyName ?? undefined
                  })
                );

                return (
                  <TableRow key={cert.certificateId} linked>
                    <TableCell>
                      <RowLink
                        {...getInstancePinningLink(
                          currentProject.orgId,
                          currentProject,
                          `certificates/${cert.certificateId}`
                        )!}
                      >
                        {cert.commonName || "N/A"}
                      </RowLink>
                    </TableCell>
                    <TableCell>
                      {expiryDetails ? (
                        <Badge variant={expiryDetails.variant}>{expiryDetails.label}</Badge>
                      ) : (
                        <Badge variant="neutral">Unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell isTruncatable>
                      {truncateSerialNumber(cert.serialNumber || "")}
                    </TableCell>
                    <TableCell>
                      {cert.notAfter ? format(new Date(cert.notAfter), "MMM dd, yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      {cert.lastSeenAt
                        ? format(new Date(cert.lastSeenAt), "MMM dd, yyyy HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label="Certificate options"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={2}>
                          <DropdownMenuItem
                            isDisabled={!canReadCertificate}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("certificateExport", {
                                certificateId: cert.certificateId,
                                serialNumber: cert.serialNumber
                              });
                            }}
                          >
                            <FileOutputIcon />
                            Export Certificate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            isDisabled={!canReadCertificate || !cert.serialNumber}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("certificateCert", {
                                serialNumber: cert.serialNumber
                              });
                            }}
                          >
                            <EyeIcon />
                            View Details
                          </DropdownMenuItem>
                          {hasProjectRole("admin") && !cert.applicationId && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setAssignTargetId(cert.certificateId);
                              }}
                            >
                              <BoxIcon />
                              Assign to Application
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CertificateCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateExportModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        onFormatSelected={handleCertificateExport}
      />
      {assignTargetId ? (
        <AssignCertificateToApplicationModal
          isOpen={Boolean(assignTargetId)}
          onClose={() => setAssignTargetId(null)}
          certificateId={assignTargetId}
        />
      ) : null}
    </Card>
  );
};
