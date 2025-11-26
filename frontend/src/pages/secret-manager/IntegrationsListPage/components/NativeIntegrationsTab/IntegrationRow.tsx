import { useMemo } from "react";
import {
  faCalendarCheck,
  faCheck,
  faInfoCircle,
  faRefresh,
  faTrash,
  faWarning,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { TCloudIntegration } from "@app/hooks/api/integrations/types";
import { TIntegration } from "@app/hooks/api/types";

import { getIntegrationDestination, IntegrationDetails } from "./IntegrationDetails";

type IProps = {
  integration: TIntegration;
  environment?: { name: string; slug: string; id: string };
  onRemoveIntegration: VoidFunction;
  onManualSyncIntegration: VoidFunction;
  cloudIntegration: TCloudIntegration;
};

export const IntegrationRow = ({
  integration,
  environment,
  onRemoveIntegration,
  onManualSyncIntegration,
  cloudIntegration
}: IProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { id, secretPath, syncMessage, isSynced } = integration;

  const failureMessage = useMemo(() => {
    if (isSynced === false) {
      if (syncMessage)
        try {
          return JSON.stringify(JSON.parse(syncMessage), null, 2);
        } catch {
          return syncMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [isSynced, syncMessage]);

  return (
    <Tr
      onClick={() =>
        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/$integrationId",
          params: {
            orgId: currentOrg.id,
            integrationId: integration.id,
            projectId: currentProject.id
          }
        })
      }
      className={twMerge(
        "group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700",
        isSynced === false && "bg-red/5 hover:bg-red/10"
      )}
      key={`integration-${id}`}
    >
      <Td>
        <div className="flex items-center gap-2">
          <img
            alt={`${cloudIntegration?.name} integration`}
            src={`/images/integrations/${cloudIntegration?.image}`}
            className="h-5 w-5"
          />
          <span className="hidden lg:inline">{cloudIntegration?.name}</span>
        </div>
      </Td>
      <Td className="max-w-0 min-w-32!">
        <Tooltip side="top" className="max-w-2xl break-words" content={secretPath}>
          <p className="truncate">{secretPath}</p>
        </Tooltip>{" "}
      </Td>
      <Td>{environment?.name ?? "-"}</Td>
      <Td className="max-w-0 min-w-20!">
        <div className="flex items-center gap-2">
          <p className="truncate">{getIntegrationDestination(integration)}</p>
          <Tooltip
            position="left"
            className="max-w-lg min-w-[20rem]"
            content={<IntegrationDetails integration={integration} />}
          >
            <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
          </Tooltip>
        </div>
      </Td>
      <Td>
        {" "}
        {typeof integration.isSynced !== "boolean" ? (
          <Badge variant="info" key={integration.id}>
            Pending Sync
          </Badge>
        ) : (
          <Tooltip
            position="left"
            className="max-w-sm"
            content={
              <div className="flex flex-col gap-2 py-1">
                {integration.lastUsed && (
                  <div>
                    <div
                      className={`mb-2 flex self-start ${!isSynced ? "text-yellow" : "text-green"}`}
                    >
                      <FontAwesomeIcon
                        icon={faCalendarCheck}
                        className="ml-1 pt-0.5 pr-1.5 text-sm"
                      />
                      <div className="text-xs">Last Synced</div>
                    </div>
                    <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">
                      {format(new Date(integration.lastUsed!), "yyyy-MM-dd, hh:mm aaa")}
                    </div>
                  </div>
                )}
                {failureMessage && (
                  <div>
                    <div className="mb-2 flex self-start text-red">
                      <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                      <div className="text-xs">Failure Reason</div>
                    </div>
                    <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">{failureMessage}</div>
                  </div>
                )}
              </div>
            }
          >
            <div className="w-min whitespace-nowrap">
              <Badge variant={integration.isSynced ? "success" : "danger"} key={integration.id}>
                <div className="flex items-center space-x-1">
                  <FontAwesomeIcon icon={integration.isSynced ? faCheck : faWarning} />
                  <div>{integration.isSynced ? "Synced" : "Not Synced"}</div>
                </div>
              </Badge>
            </div>
          </Tooltip>
        )}
      </Td>
      <Td>
        <div className="flex gap-2 whitespace-nowrap">
          <Tooltip className="max-w-sm text-center" content="Manually Sync">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                onManualSyncIntegration();
              }}
              ariaLabel="sync"
              colorSchema="secondary"
              variant="plain"
            >
              <FontAwesomeIcon icon={faRefresh} />
            </IconButton>
          </Tooltip>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Delete}
            a={ProjectPermissionSub.Integrations}
          >
            {(isAllowed: boolean) => (
              <Tooltip content="Remove Integration">
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveIntegration();
                  }}
                  ariaLabel="delete"
                  isDisabled={!isAllowed}
                  colorSchema="danger"
                  variant="plain"
                >
                  <FontAwesomeIcon icon={faTrash} className="px-1" />
                </IconButton>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        </div>
      </Td>
    </Tr>
  );
};
