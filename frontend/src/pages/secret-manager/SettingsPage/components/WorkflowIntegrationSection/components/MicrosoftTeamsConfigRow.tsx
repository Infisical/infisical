import { BsMicrosoftTeams } from "react-icons/bs";
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
  Spinner,
  Td,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useWorkspace } from "@app/context";
import {
  useGetMicrosoftTeamsIntegrationTeams,
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

export const MicrosoftTeamsConfigRow = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data: microsoftTeamsConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    workspaceId: currentWorkspace?.id ?? "",
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });

  const { data: microsoftTeamsChannels, isPending: isMicrosoftTeamsChannelsLoading } =
    useGetMicrosoftTeamsIntegrationTeams(microsoftTeamsConfig?.integrationId);
  const microsoftTeamsChannelIdToName = Object.fromEntries(
    microsoftTeamsChannels?.flatMap((team) =>
      team.channels.map((channel) => [channel.channelId, channel.channelName])
    ) ?? []
  );

  if (microsoftTeamsConfig?.integration !== WorkflowIntegrationPlatform.MICROSOFT_TEAMS) {
    return null;
  }

  return (
    <Tr>
      <Td className="flex max-w-xs items-center overflow-hidden text-ellipsis">
        <div className="flex items-center gap-2">
          <BsMicrosoftTeams />
          Microsoft Teams
        </div>
      </Td>
      <Td>
        {microsoftTeamsConfig.isAccessRequestNotificationEnabled ? (
          <FontAwesomeIcon icon={faCheck} className="text-green-500" />
        ) : (
          <FontAwesomeIcon icon={faXmark} className="text-red-500" />
        )}
      </Td>
      <Td>
        {microsoftTeamsConfig.isSecretRequestNotificationEnabled ? (
          <FontAwesomeIcon icon={faCheck} className="text-green-500" />
        ) : (
          <FontAwesomeIcon icon={faXmark} className="text-red-500" />
        )}
      </Td>
      <Td>
        {isMicrosoftTeamsChannelsLoading ? (
          <Spinner size="xs" />
        ) : (
          <Badge>
            {microsoftTeamsConfig.accessRequestChannels?.channelIds
              ?.map((channel) => microsoftTeamsChannelIdToName[channel])
              .join(", ")}
          </Badge>
        )}
      </Td>
      <Td>
        {isMicrosoftTeamsChannelsLoading ? (
          <Spinner size="xs" />
        ) : (
          <Badge>
            {microsoftTeamsConfig.secretRequestChannels?.channelIds
              ?.map((channel) => microsoftTeamsChannelIdToName[channel])
              .join(", ")}
          </Badge>
        )}
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
                      integrationId: microsoftTeamsConfig.integrationId,
                      integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
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
                      integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
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
