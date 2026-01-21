import { useState } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel, IconButton, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionMcpEndpointActions, ProjectPermissionSub } from "@app/context";
import { TAiMcpEndpointWithServerIds } from "@app/hooks/api";

import { PiiFilterConfigModal } from "./PiiFilterConfigModal";

type Props = {
  endpoint: TAiMcpEndpointWithServerIds;
};

const PII_ENTITY_LABELS: Record<string, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  SSN: "SSN",
  CREDIT_CARD: "Credit Card",
  IP_ADDRESS: "IP Address"
};

export const MCPEndpointFiltersSection = ({ endpoint }: Props) => {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const piiEntityTypes = endpoint.piiEntityTypes || [];
  const displayedTypes = piiEntityTypes.slice(0, 3);
  const remainingTypes = piiEntityTypes.slice(3);
  const remainingCount = remainingTypes.length;

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Filters</h3>
          <ProjectPermissionCan
            I={ProjectPermissionMcpEndpointActions.Edit}
            a={ProjectPermissionSub.McpEndpoints}
          >
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                ariaLabel="Edit filter settings"
                onClick={() => setIsConfigModalOpen(true)}
                isDisabled={!isAllowed}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <div className="space-y-3">
          <GenericFieldLabel label="Requests">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${endpoint.piiRequestFiltering ? "bg-emerald-500" : "bg-red-500"}`}
              />
              {endpoint.piiRequestFiltering ? "Enabled" : "Disabled"}
            </div>
          </GenericFieldLabel>
          <GenericFieldLabel label="Responses">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${endpoint.piiResponseFiltering ? "bg-emerald-500" : "bg-red-500"}`}
              />
              {endpoint.piiResponseFiltering ? "Enabled" : "Disabled"}
            </div>
          </GenericFieldLabel>
          <GenericFieldLabel label="Identifiers">
            {piiEntityTypes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {displayedTypes.map((type) => (
                  <Badge key={type} variant="info">
                    {PII_ENTITY_LABELS[type] || type}
                  </Badge>
                ))}
                {remainingCount > 0 && (
                  <Tooltip
                    content={remainingTypes.map((t) => PII_ENTITY_LABELS[t] || t).join(", ")}
                  >
                    <span className="cursor-default text-xs text-bunker-400">
                      +{remainingCount}
                    </span>
                  </Tooltip>
                )}
              </div>
            ) : (
              <span className="text-bunker-400">No identifiers selected</span>
            )}
          </GenericFieldLabel>
        </div>
      </div>

      <PiiFilterConfigModal
        isOpen={isConfigModalOpen}
        onOpenChange={setIsConfigModalOpen}
        endpoint={endpoint}
      />
    </>
  );
};
