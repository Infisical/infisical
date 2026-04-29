import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
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
};

export const CertificateRequestRow = ({ request, onViewCertificates }: Props) => {
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
        return (
          <Tooltip
            position="top"
            content={pendingMessage || "Awaiting issuance"}
            className="max-w-sm break-words"
          >
            <div>
              <Badge variant="info">Pending Issuance</Badge>
            </div>
          </Tooltip>
        );
      case CertificateRequestStatus.PENDING_VALIDATION:
        return (
          <Tooltip
            position="top"
            content={pendingMessage || "Awaiting CA validation"}
            className="max-w-sm break-words"
          >
            <div>
              <Badge variant="warning">Pending Validation</Badge>
            </div>
          </Tooltip>
        );
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

  const isCancellable =
    request.status === CertificateRequestStatus.PENDING ||
    request.status === CertificateRequestStatus.PENDING_VALIDATION;

  const hasMenu =
    (request.status === CertificateRequestStatus.ISSUED && Boolean(request.certificateId)) ||
    request.status === CertificateRequestStatus.PENDING_VALIDATION ||
    isCancellable;

  return (
    <Tr className="h-10 hover:bg-mineshaft-700">
      <Td>
        <div className="max-w-xs truncate" title={displayName}>
          {displayName}
        </div>
      </Td>
      <Td>
        <div className="max-w-xs truncate" title={request.certificate?.serialNumber || "N/A"}>
          {truncateSerialNumber(request.certificate?.serialNumber)}
        </div>
      </Td>
      <Td>{getStatusBadge(request)}</Td>
      <Td>
        <div className="max-w-xs truncate">{request.profileName || "N/A"}</div>
      </Td>
      <Td>
        <Tooltip content={format(new Date(request.createdAt), "MMM dd, yyyy HH:mm:ss")}>
          <time dateTime={request.createdAt}>
            {format(new Date(request.createdAt), "yyyy-MM-dd")}
          </time>
        </Tooltip>
      </Td>
      <Td>
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="rounded-lg">
              <IconButton
                variant="plain"
                ariaLabel="More options"
                className="h-max bg-transparent p-0"
              >
                <FontAwesomeIcon size="lg" icon={faEllipsis} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={3}>
              {request.status === CertificateRequestStatus.ISSUED && request.certificateId && (
                <DropdownMenuItem
                  onClick={() => onViewCertificates?.(request.certificateId!)}
                  className="flex items-center gap-2"
                >
                  View Certificate
                </DropdownMenuItem>
              )}
              {request.status === CertificateRequestStatus.PENDING_VALIDATION && (
                <DropdownMenuItem
                  onClick={handleTriggerValidation}
                  isDisabled={isTriggering}
                  className="flex items-center gap-2"
                >
                  {isTriggering ? "Triggering…" : "Trigger Validation"}
                </DropdownMenuItem>
              )}
              {isCancellable && (
                <DropdownMenuItem
                  onClick={handleCancel}
                  isDisabled={isCancelling}
                  className="flex items-center gap-2"
                >
                  {isCancelling ? "Cancelling…" : "Cancel Request"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </Td>
    </Tr>
  );
};
