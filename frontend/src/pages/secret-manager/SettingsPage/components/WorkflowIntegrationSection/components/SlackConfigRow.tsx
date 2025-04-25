import { BsSlack } from "react-icons/bs";
import { faCheck, faEllipsis, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useWorkspace } from "@app/context";
import {
  useGetSlackIntegrationChannels,
  useGetWorkspaceWorkflowIntegrationConfig
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIntegration", "editIntegration"]>,
    data?: {
      integrationId?: string;
      integration: WorkflowIntegrationPlatform;
    }
  ) => void;
};

export const SlackConfigRow = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    workspaceId: currentWorkspace?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });

  const { data: slackChannels } = useGetSlackIntegrationChannels(slackConfig?.integrationId);
  const slackChannelIdToName = Object.fromEntries(
    (slackChannels || []).map((channel) => [channel.id, channel.name])
  );

  if (slackConfig?.integration !== WorkflowIntegrationPlatform.SLACK) {
    return null;
  }

  return (
    <Tr>
      <Td className="flex max-w-xs items-center overflow-hidden text-ellipsis">
        <div className="flex items-center gap-2">
          <BsSlack />
          Slack
        </div>
      </Td>
      <Td>
        {slackConfig.isAccessRequestNotificationEnabled ? (
          <FontAwesomeIcon icon={faCheck} className="text-green-500" />
        ) : (
          <FontAwesomeIcon icon={faXmark} className="text-red-500" />
        )}
      </Td>
      <Td>
        {slackConfig.isSecretRequestNotificationEnabled ? (
          <FontAwesomeIcon icon={faCheck} className="text-green-500" />
        ) : (
          <FontAwesomeIcon icon={faXmark} className="text-red-500" />
        )}
      </Td>
      <Td>
        <Badge>
          {slackConfig.accessRequestChannels
            .split(", ")
            .map((channel) => slackChannelIdToName[channel])
            .join(", ")}
        </Badge>
      </Td>
      <Td>
        <Badge>
          {slackConfig.secretRequestChannels
            .split(", ")
            .map((channel) => slackChannelIdToName[channel])
            .join(", ")}
        </Badge>
      </Td>

      <Td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div className="flex justify-end hover:text-primary-400 data-[state=open]:text-primary-400">
              <FontAwesomeIcon size="sm" icon={faEllipsis} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-1">
            <OrgPermissionCan I={OrgPermissionActions.Delete} an={OrgPermissionSubjects.Settings}>
              {(isAllowed) => (
                <DropdownMenuItem
                  disabled={!isAllowed}
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();

                    handlePopUpOpen("removeIntegration", {
                      integrationId: slackConfig.integrationId,
                      integration: WorkflowIntegrationPlatform.SLACK
                    });
                  }}
                >
                  Delete
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
            <OrgPermissionCan I={OrgPermissionActions.Edit} an={OrgPermissionSubjects.Settings}>
              {(isAllowed) => (
                <DropdownMenuItem
                  disabled={!isAllowed}
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();

                    handlePopUpOpen("editIntegration", {
                      integration: WorkflowIntegrationPlatform.SLACK
                    });
                  }}
                >
                  Edit
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
