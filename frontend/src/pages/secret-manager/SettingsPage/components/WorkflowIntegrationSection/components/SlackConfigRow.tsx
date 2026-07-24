import { BsSlack } from "react-icons/bs";
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
import { useGetSlackIntegrationChannels } from "@app/hooks/api";
import {
  ProjectWorkflowIntegrationConfig,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { NotificationChannelsCell } from "./NotificationChannelsCell";

type Props = {
  slackConfig?: ProjectWorkflowIntegrationConfig | null;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIntegration", "editIntegration"]>,
    data?: {
      integrationId?: string;
      integration: WorkflowIntegrationPlatform;
    }
  ) => void;
};

const getChannelNames = (channels: string, channelIdToName: Record<string, string>) =>
  channels
    .split(", ")
    .map((channelId) => channelIdToName[channelId])
    .filter(Boolean);

export const SlackConfigRow = ({ handlePopUpOpen, slackConfig }: Props) => {
  const { data: slackChannels, isPending: isSlackChannelsLoading } = useGetSlackIntegrationChannels(
    slackConfig?.integrationId
  );
  const slackChannelIdToName = Object.fromEntries(
    (slackChannels || []).map((channel) => [channel.id, channel.name])
  );

  if (slackConfig?.integration !== WorkflowIntegrationPlatform.SLACK) {
    return null;
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <BsSlack />
          Slack
        </div>
      </TableCell>
      <NotificationChannelsCell
        isLoading={isSlackChannelsLoading}
        isEnabled={slackConfig.isAccessRequestNotificationEnabled}
        channelNames={getChannelNames(slackConfig.accessRequestChannels, slackChannelIdToName)}
      />
      <NotificationChannelsCell
        isLoading={isSlackChannelsLoading}
        isEnabled={slackConfig.isSecretRequestNotificationEnabled}
        channelNames={getChannelNames(slackConfig.secretRequestChannels, slackChannelIdToName)}
      />
      <NotificationChannelsCell
        isLoading={isSlackChannelsLoading}
        isEnabled={slackConfig.isSecretSyncErrorNotificationEnabled}
        channelNames={getChannelNames(slackConfig.secretSyncErrorChannels, slackChannelIdToName)}
      />
      <TableCell>
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Actions for Slack integration">
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
                        integration: WorkflowIntegrationPlatform.SLACK
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
                        integrationId: slackConfig.integrationId,
                        integration: WorkflowIntegrationPlatform.SLACK
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
