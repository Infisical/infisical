import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { TCertificateRequestListItem } from "@app/hooks/api/certificates";

type Props = {
  request: TCertificateRequestListItem;
  onViewCertificates?: (certificateId: string) => void;
};

export const CertificateRequestRow = ({ request, onViewCertificates }: Props) => {
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "issued":
        return <Badge variant="success">Issued</Badge>;
      case "failed":
        return <Badge variant="danger">Failed</Badge>;
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
      <Td>{getStatusBadge(request.status)}</Td>
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
        <Tooltip content={format(new Date(request.updatedAt), "MMM dd, yyyy HH:mm:ss")}>
          <time dateTime={request.updatedAt}>
            {format(new Date(request.updatedAt), "yyyy-MM-dd")}
          </time>
        </Tooltip>
      </Td>
      <Td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
              <Tooltip content="More options">
                <FontAwesomeIcon size="lg" icon={faEllipsis} />
              </Tooltip>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
