/* eslint-disable no-nested-ternary */
import { BsSlack } from "react-icons/bs";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
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
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useGetSlackIntegrationChannels } from "@app/hooks/api";
import {
  ProjectWorkflowIntegrationConfig,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  slackConfig?: ProjectWorkflowIntegrationConfig | null;
  isSlackConfigLoading: boolean;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIntegration", "editIntegration"]>,
    data?: {
      integrationId?: string;
      integration: WorkflowIntegrationPlatform;
    }
  ) => void;
};

export const SlackConfigRow = ({ handlePopUpOpen, isSlackConfigLoading, slackConfig }: Props) => {
  const { data: slackChannels, isPending: isSlackChannelsLoading } = useGetSlackIntegrationChannels(
    slackConfig?.integrationId
  );
  const slackChannelIdToName = Object.fromEntries(
    (slackChannels || []).map((channel) => [channel.id, channel.name])
  );

  if (slackConfig?.integration !== WorkflowIntegrationPlatform.SLACK) {
    return null;
  }

  const isLoadingConfig = isSlackChannelsLoading || isSlackConfigLoading;

  return (
    <Tr>
      <Td className="flex max-w-xs items-center overflow-hidden text-ellipsis">
        <div className="flex items-center gap-2">
          <BsSlack />
          Slack
        </div>
      </Td>
      <Td>
        {slackConfig.isAccessRequestNotificationEnabled &&
        !isLoadingConfig &&
        slackConfig.accessRequestChannels.length > 0 ? (
          <Badge>
            {slackConfig.accessRequestChannels
              .split(", ")
              .map((channel) => slackChannelIdToName[channel])
              .join(", ")}
          </Badge>
        ) : isLoadingConfig ? (
          <Spinner size="xs" />
        ) : (
          <Badge variant="danger">Disabled</Badge>
        )}
      </Td>
      <Td>
        {slackConfig.isSecretRequestNotificationEnabled &&
        !isLoadingConfig &&
        slackConfig.secretRequestChannels.length > 0 ? (
          <Badge>
            {slackConfig.secretRequestChannels
              .split(", ")
              .map((channel) => slackChannelIdToName[channel])
              .join(", ")}
          </Badge>
        ) : isLoadingConfig ? (
          <Spinner size="xs" />
        ) : (
          <Badge variant="danger">Disabled</Badge>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
