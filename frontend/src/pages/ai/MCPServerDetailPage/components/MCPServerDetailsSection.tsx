import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { GenericFieldLabel, IconButton } from "@app/components/v2";
import { AiMcpServerStatus, TAiMcpServer } from "@app/hooks/api";

type Props = {
  server: TAiMcpServer;
  onEdit: VoidFunction;
};

const getStatusLabel = (status: AiMcpServerStatus) => {
  const labels: Record<AiMcpServerStatus, string> = {
    [AiMcpServerStatus.ACTIVE]: "Active",
    [AiMcpServerStatus.INACTIVE]: "Inactive",
    [AiMcpServerStatus.UNINITIALIZED]: "Uninitialized"
  };
  return labels[status] || "Unknown";
};

const getStatusColor = (status: AiMcpServerStatus) => {
  const colors: Record<AiMcpServerStatus, string> = {
    [AiMcpServerStatus.ACTIVE]: "bg-emerald-500",
    [AiMcpServerStatus.INACTIVE]: "bg-red-500",
    [AiMcpServerStatus.UNINITIALIZED]: "bg-yellow-500"
  };
  return colors[status] || "bg-yellow-500";
};

export const MCPServerDetailsSection = ({ server, onEdit }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Details</h3>
        <IconButton
          variant="plain"
          colorSchema="secondary"
          ariaLabel="Edit server details"
          onClick={onEdit}
        >
          <FontAwesomeIcon icon={faEdit} />
        </IconButton>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Name">{server.name}</GenericFieldLabel>
        <GenericFieldLabel label="Description">{server.description}</GenericFieldLabel>
        <GenericFieldLabel label="Status">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${getStatusColor(server.status)}`} />
            {getStatusLabel(server.status)}
          </div>
        </GenericFieldLabel>
        <GenericFieldLabel label="Created">
          {format(new Date(server.createdAt), "yyyy-MM-dd, hh:mm aaa")}
        </GenericFieldLabel>
      </div>
    </div>
  );
};
