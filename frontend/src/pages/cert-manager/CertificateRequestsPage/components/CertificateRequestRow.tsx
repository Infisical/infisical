import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  CertificateRequestStatus,
  TCertificateRequestListItem,
  useTriggerCertificateRequestValidation
} from "@app/hooks/api/certificates";

type Props = {
  request: TCertificateRequestListItem;
  onViewCertificates?: (certificateId: string) => void;
  applicationName?: string;
};

export const CertificateRequestRow = ({ request, onViewCertificates, applicationName }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { mutateAsync: triggerValidation, isPending: isTriggering } =
    useTriggerCertificateRequestValidation();

  const handleTriggerValidation = async () => {
    try {
      const result = await triggerValidation({ requestId: request.id });
      if (result.status === CertificateRequestStatus.ISSUED) {
        createNotification({ text: "Certificate issued successfully", type: "success" });
      } else if (result.status === CertificateRequestStatus.FAILED) {
        createNotification({
          text: `Validation failed${result.orderStatus ? ` (${result.orderStatus})` : ""}`,
          type: "error"
        });
      } else {
        createNotification({
          text: `Still pending validation${result.orderStatus ? ` (${result.orderStatus})` : ""}`,
          type: "info"
        });
      }
    } catch (err) {
      createNotification({
        text: err instanceof Error ? err.message : "Failed to trigger validation",
        type: "error"
      });
    }
  };

  const getStatusBadge = (
    status: string,
    approvalRequestId: string | null,
    errorMessage: string | null
  ) => {
    switch (status) {
      case CertificateRequestStatus.ISSUED:
        return <Badge variant="success">Issued</Badge>;
      case CertificateRequestStatus.FAILED:
      case CertificateRequestStatus.REJECTED:
        return (
          <Tooltip
            position="top"
            content={errorMessage || "Certificate request failed"}
            className="max-w-sm break-words"
          >
            <div>
              <Badge variant="danger">Failed</Badge>
            </div>
          </Tooltip>
        );
      case CertificateRequestStatus.PENDING:
        return <Badge variant="info">Pending Issuance</Badge>;
      case CertificateRequestStatus.PENDING_VALIDATION:
        return <Badge variant="warning">Pending Validation</Badge>;
      case CertificateRequestStatus.PENDING_APPROVAL:
        if (approvalRequestId && currentOrg?.id && currentProject?.id) {
          return (
            <Badge variant="warning" asChild>
              <Link
                to="/organizations/$orgId/projects/cert-manager/$projectId/approvals/$approvalRequestId"
                params={{
                  orgId: currentOrg.id,
                  projectId: currentProject.id,
                  approvalRequestId
                }}
                search={applicationName ? { applicationName } : undefined}
              >
                Pending Approval
                <ExternalLinkIcon />
              </Link>
            </Badge>
          );
        }
        return <Badge variant="project">Pending Approval</Badge>;
      default:
        return <Badge variant="outline">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
    }
  };

  const { displayName } = getCertificateDisplayName(
    {
      altNames: request.altNames,
      commonName: request.commonName
    },
    64,
    "—"
  );

  return (
    <TableRow className="group">
      <TableCell isTruncatable>{displayName}</TableCell>
      <TableCell isTruncatable>
        {truncateSerialNumber(request.certificate?.serialNumber) || "—"}
      </TableCell>
      <TableCell>
        {getStatusBadge(request.status, request.approvalRequestId, request.errorMessage)}
      </TableCell>
      <TableCell isTruncatable>{request.profileName || "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        <Tooltip content={format(new Date(request.createdAt), "MMM dd, yyyy HH:mm:ss")}>
          <time dateTime={request.createdAt}>
            {format(new Date(request.createdAt), "yyyy-MM-dd")}
          </time>
        </Tooltip>
      </TableCell>
      <TableCell>
        {request.status === CertificateRequestStatus.ISSUED && request.certificateId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Request actions">
                <FontAwesomeIcon icon={faEllipsis} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={3}>
              <DropdownMenuItem onClick={() => onViewCertificates?.(request.certificateId!)}>
                View Certificate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {request.status === CertificateRequestStatus.PENDING_VALIDATION && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Request actions">
                <FontAwesomeIcon icon={faEllipsis} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={3}>
              <DropdownMenuItem onClick={handleTriggerValidation} isDisabled={isTriggering}>
                {isTriggering ? "Triggering…" : "Trigger Validation"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
};
