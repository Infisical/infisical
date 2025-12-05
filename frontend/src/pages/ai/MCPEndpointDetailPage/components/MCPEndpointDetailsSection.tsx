import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { GenericFieldLabel, IconButton } from "@app/components/v2";
import { TAiMcpEndpointWithServerIds } from "@app/hooks/api";

type Props = {
  endpoint: TAiMcpEndpointWithServerIds;
  onEdit: VoidFunction;
};

const getStatusLabel = (status: string | null) => {
  const labels: Record<string, string> = {
    active: "Active",
    inactive: "Inactive"
  };
  return labels[status || "inactive"] || "Unknown";
};

const getStatusColor = (status: string | null) => {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    inactive: "bg-red-500"
  };
  return colors[status || "inactive"] || "bg-red-500";
};

export const MCPEndpointDetailsSection = ({ endpoint, onEdit }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Details</h3>
        <IconButton
          variant="plain"
          colorSchema="secondary"
          ariaLabel="Edit endpoint details"
          onClick={onEdit}
        >
          <FontAwesomeIcon icon={faEdit} />
        </IconButton>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Name">{endpoint.name}</GenericFieldLabel>
        <GenericFieldLabel label="Description">
          {endpoint.description || <span className="text-bunker-400">No description</span>}
        </GenericFieldLabel>
        <GenericFieldLabel label="Status">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${getStatusColor(endpoint.status)}`} />
            {getStatusLabel(endpoint.status)}
          </div>
        </GenericFieldLabel>
        <GenericFieldLabel label="Created">
          {format(new Date(endpoint.createdAt), "yyyy-MM-dd, hh:mm aaa")}
        </GenericFieldLabel>
      </div>
    </div>
  );
};
