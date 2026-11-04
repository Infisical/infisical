import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  CertificateRequestStatus,
  TCertificateRequestListItem,
  useCancelCertificateRequest,
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
  const { mutateAsync: cancelRequest, isPending: isCancelling } = useCancelCertificateRequest();

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

  const handleCancel = async () => {
    try {
      const result = await cancelRequest({ requestId: request.id });
      if (result.cancelled) {
        createNotification({ text: "Certificate request cancelled", type: "success" });
      } else {
        createNotification({
          text: "Could not cancel — the request already reached a terminal state",
          type: "info"
        });
      }
    } catch (err) {
      createNotification({
        text: err instanceof Error ? err.message : "Failed to cancel certificate request",
        type: "error"
      });
    }
  };

  const getStatusBadge = (req: TCertificateRequestListItem) => {
    const { status, approvalRequestId, errorMessage, pendingMessage } = req;

    switch (status) {
      case CertificateRequestStatus.ISSUED:
        return <Badge variant="success">Issued</Badge>;
      case CertificateRequestStatus.FAILED:
      case CertificateRequestStatus.REJECTED:
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="danger">Failed</Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-words">
              {errorMessage || "Certificate request failed"}
            </TooltipContent>
          </Tooltip>
        );
      case CertificateRequestStatus.PENDING:
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="info">Pending Issuance</Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-words">
              {pendingMessage || "Awaiting issuance"}
            </TooltipContent>
          </Tooltip>
        );
      case CertificateRequestStatus.PENDING_VALIDATION:
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="warning">Pending Validation</Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-words">
              {pendingMessage || "Awaiting CA validation"}
            </TooltipContent>
          </Tooltip>
        );
      case CertificateRequestStatus.PENDING_APPROVAL:
        if (approvalRequestId && currentOrg?.id && currentProject?.id) {
          return (
            <Badge variant="warning" asChild>
              <Link
                to="/organizations/$orgId/cert-manager/approvals/$approvalRequestId"
                params={{
                  orgId: currentOrg.id,
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
        return (
          <Badge variant="outline">
            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
          </Badge>
        );
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

  const isCancellable =
    request.status === CertificateRequestStatus.PENDING ||
    request.status === CertificateRequestStatus.PENDING_VALIDATION;

  const hasMenu =
    (request.status === CertificateRequestStatus.ISSUED && Boolean(request.certificateId)) ||
    request.status === CertificateRequestStatus.PENDING_VALIDATION ||
    isCancellable;

  return (
    <TableRow className="group">
      <TableCell isTruncatable>{displayName}</TableCell>
      <TableCell isTruncatable>
        {truncateSerialNumber(request.certificate?.serialNumber) || "—"}
      </TableCell>
      <TableCell>{getStatusBadge(request)}</TableCell>
      <TableCell isTruncatable>{request.profileName || "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        <Tooltip>
          <TooltipTrigger>
            <time dateTime={request.createdAt}>
              {format(new Date(request.createdAt), "yyyy-MM-dd")}
            </time>
          </TooltipTrigger>
          <TooltipContent>
            {format(new Date(request.createdAt), "MMM dd, yyyy HH:mm:ss")}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Request actions">
                <FontAwesomeIcon icon={faEllipsis} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={3}>
              {request.status === CertificateRequestStatus.ISSUED && request.certificateId && (
                <DropdownMenuItem onClick={() => onViewCertificates?.(request.certificateId!)}>
                  View Certificate
                </DropdownMenuItem>
              )}
              {request.status === CertificateRequestStatus.PENDING_VALIDATION && (
                <DropdownMenuItem onClick={handleTriggerValidation} isDisabled={isTriggering}>
                  {isTriggering ? "Triggering…" : "Trigger Validation"}
                </DropdownMenuItem>
              )}
              {isCancellable && (
                <DropdownMenuItem onClick={handleCancel} isDisabled={isCancelling}>
                  {isCancelling ? "Cancelling…" : "Cancel Request"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
};
