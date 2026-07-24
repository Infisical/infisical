import { BsMicrosoftTeams } from "react-icons/bs";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useGetMicrosoftTeamsIntegrationTeams } from "@app/hooks/api";
import {
  ProjectWorkflowIntegrationConfig,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { NotificationChannelsCell } from "./NotificationChannelsCell";

type Props = {
  microsoftTeamsConfig?: ProjectWorkflowIntegrationConfig | null;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIntegration", "editIntegration"]>,
    data?: {
      integrationId?: string;
      integration: WorkflowIntegrationPlatform;
    }
  ) => void;
};

const getChannelNames = (
  channels: { channelIds: string[] } | undefined,
  channelIdToName: Record<string, string>
) => (channels?.channelIds ?? []).map((channelId) => channelIdToName[channelId]).filter(Boolean);

export const MicrosoftTeamsConfigRow = ({ handlePopUpOpen, microsoftTeamsConfig }: Props) => {
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
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <BsMicrosoftTeams />
          Microsoft Teams
        </div>
      </TableCell>
      <NotificationChannelsCell
        isLoading={isMicrosoftTeamsChannelsLoading}
        isEnabled={microsoftTeamsConfig.isAccessRequestNotificationEnabled}
        channelNames={getChannelNames(
          microsoftTeamsConfig.accessRequestChannels,
          microsoftTeamsChannelIdToName
        )}
      />
      <NotificationChannelsCell
        isLoading={isMicrosoftTeamsChannelsLoading}
        isEnabled={microsoftTeamsConfig.isSecretRequestNotificationEnabled}
        channelNames={getChannelNames(
          microsoftTeamsConfig.secretRequestChannels,
          microsoftTeamsChannelIdToName
        )}
      />
      <TableCell>
        <span className="text-muted">Not supported</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Actions for Microsoft Teams integration"
              >
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Settings}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() =>
                      handlePopUpOpen("editIntegration", {
                        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
                      })
                    }
                  >
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.Settings}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() =>
                      handlePopUpOpen("removeIntegration", {
                        integrationId: microsoftTeamsConfig.integrationId,
                        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
                      })
                    }
                  >
                    <Trash2 />
                    Remove
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
