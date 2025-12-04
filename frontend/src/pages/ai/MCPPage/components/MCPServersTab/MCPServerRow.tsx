import { useCallback } from "react";
import { faCheck, faCopy, faEdit, faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { AiMcpServerStatus, TAiMcpServer } from "@app/hooks/api";

interface Props {
  server: TAiMcpServer;
  onEditServer: (server: TAiMcpServer) => void;
  onDeleteServer: (server: TAiMcpServer) => void;
}

export const MCPServerRow = ({ server, onEditServer, onDeleteServer }: Props) => {
  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(server.id);

    createNotification({
      text: "Server ID copied to clipboard",
      type: "info"
    });

    setTimeout(() => setIsIdCopied.off(), 2000);
  }, [setIsIdCopied, server.id]);

  const getStatusBadge = (status: AiMcpServerStatus) => {
    const statusConfig = {
      [AiMcpServerStatus.ACTIVE]: {
        color: "bg-emerald-500",
        label: "Active"
      },
      [AiMcpServerStatus.INACTIVE]: {
        color: "bg-red-500",
        label: "Inactive"
      },
      [AiMcpServerStatus.UNINITIALIZED]: {
        color: "bg-yellow-500",
        label: "Uninitialized"
      }
    };

    const config = statusConfig[status] || statusConfig[AiMcpServerStatus.UNINITIALIZED];

    return (
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${config.color}`} />
        <span className="text-sm text-mineshaft-300">{config.label}</span>
      </div>
    );
  };

  return (
    <Tr className="h-10 transition-colors duration-100 hover:bg-mineshaft-700">
      <Td>
        <span className="text-mineshaft-300">{server.name}</span>
      </Td>
      <Td>{getStatusBadge(server.status)}</Td>
      <Td>
        <span className="text-sm text-mineshaft-300">{server.toolsCount ?? 0}</span>
      </Td>
      <Td className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div className="flex cursor-pointer justify-end hover:text-primary-400 data-[state=open]:text-primary-400">
              <Tooltip content="More options">
                <FontAwesomeIcon size="lg" icon={faEllipsisV} />
              </Tooltip>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-1">
            <DropdownMenuItem
              icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} className="w-3" />}
              onClick={() => handleCopyId()}
            >
              Copy Server ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEditServer(server);
              }}
              icon={<FontAwesomeIcon icon={faEdit} className="w-3" />}
            >
              Edit Server
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDeleteServer(server);
              }}
              icon={<FontAwesomeIcon icon={faTrash} className="w-3" />}
              className="text-red-500 hover:text-red-400"
            >
              Delete Server
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
