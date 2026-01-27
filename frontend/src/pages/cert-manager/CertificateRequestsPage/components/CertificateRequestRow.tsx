import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

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
import { CertificateRequestStatus, TCertificateRequestListItem } from "@app/hooks/api/certificates";

type Props = {
  request: TCertificateRequestListItem;
  onViewCertificates?: (certificateId: string) => void;
};

export const CertificateRequestRow = ({ request, onViewCertificates }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const getStatusBadge = (status: string, approvalRequestId: string | null) => {
    switch (status) {
      case CertificateRequestStatus.ISSUED:
        return <Badge variant="success">Issued</Badge>;
      case CertificateRequestStatus.FAILED:
      case CertificateRequestStatus.REJECTED:
        return <Badge variant="danger">Failed</Badge>;
      case CertificateRequestStatus.PENDING:
        return <Badge variant="info">Pending Issuance</Badge>;
      case CertificateRequestStatus.PENDING_APPROVAL:
        if (approvalRequestId && currentOrg?.id && currentProject?.id) {
          return (
            <Badge variant="warning" asChild>
              <Link
                to="/organizations/$orgId/projects/cert-manager/$projectId/approval-requests/$approvalRequestId"
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
      <Td>{getStatusBadge(request.status, request.approvalRequestId)}</Td>
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
            <DropdownMenuItem
              onClick={() => request.certificateId && onViewCertificates?.(request.certificateId)}
              disabled={!request.certificateId}
              className="flex items-center gap-2"
            >
              View Certificate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
