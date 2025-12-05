import { useCallback } from "react";
import { faCheck, faCopy, faEdit, faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TAiMcpEndpoint } from "@app/hooks/api";

interface Props {
  endpoint: TAiMcpEndpoint;
  onEditEndpoint: (endpoint: TAiMcpEndpoint) => void;
  onDeleteEndpoint: (endpoint: TAiMcpEndpoint) => void;
}

const getStatusBadge = (status: string | null) => {
  const statusConfig: Record<string, { color: string; label: string }> = {
    active: {
      color: "bg-emerald-500",
      label: "Active"
    },
    inactive: {
      color: "bg-red-500",
      label: "Inactive"
    }
  };

  const config = statusConfig[status || "inactive"] || statusConfig.inactive;

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-sm text-mineshaft-300">{config.label}</span>
    </div>
  );
};

export const MCPEndpointRow = ({ endpoint, onEditEndpoint, onDeleteEndpoint }: Props) => {
  const navigate = useNavigate();
  const { orgId, projectId } = useParams({
    strict: false
  }) as { orgId?: string; projectId?: string };

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(endpoint.id);

    createNotification({
      text: "Endpoint ID copied to clipboard",
      type: "info"
    });

    setTimeout(() => setIsIdCopied.off(), 2000);
  }, [setIsIdCopied, endpoint.id]);

  const handleRowClick = () => {
    if (orgId && projectId) {
      navigate({
        to: "/organizations/$orgId/projects/ai/$projectId/mcp-endpoints/$endpointId",
        params: { orgId, projectId, endpointId: endpoint.id }
      });
    }
  };

  return (
    <Tr
      className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
      onClick={handleRowClick}
    >
      <Td>
        <span className="text-mineshaft-300">{endpoint.name}</span>
      </Td>
      <Td>{getStatusBadge(endpoint.status)}</Td>
      <Td>
        <span className="text-sm text-mineshaft-300">{endpoint.connectedServers}</span>
      </Td>
      <Td>
        <span className="text-sm text-mineshaft-300">{endpoint.activeTools}</span>
      </Td>
      <Td className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div
              className="flex cursor-pointer justify-end hover:text-primary-400 data-[state=open]:text-primary-400"
              role="button"
              tabIndex={0}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Tooltip content="More options">
                <FontAwesomeIcon size="lg" icon={faEllipsisV} />
              </Tooltip>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-1">
            <DropdownMenuItem
              icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} className="w-3" />}
              onClick={(e) => {
                e.stopPropagation();
                handleCopyId();
              }}
            >
              Copy Endpoint ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEditEndpoint(endpoint);
              }}
              icon={<FontAwesomeIcon icon={faEdit} className="w-3" />}
            >
              Edit Endpoint
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEndpoint(endpoint);
              }}
              icon={<FontAwesomeIcon icon={faTrash} className="w-3" />}
              className="text-red-500 hover:text-red-400"
            >
              Delete Endpoint
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
