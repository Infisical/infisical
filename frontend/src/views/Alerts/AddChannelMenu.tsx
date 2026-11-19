import { ChevronDownIcon, PlusIcon } from "lucide-react";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  ADD_MENU_CHANNEL_TYPES,
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType
} from "@app/hooks/api/alerts";

import { getChannelIcon } from "./channelIcons";

type Props = {
  onAdd: (channelType: AlertChannelType) => void;
  isDisabled?: boolean;
  lockedChannelTypes?: AlertChannelType[];
  onLockedSelect?: () => void;
  label?: string;
  contentClassName?: string;
};

export const AddChannelMenu = ({
  onAdd,
  isDisabled,
  lockedChannelTypes = [],
  onLockedSelect,
  label = "Add channel",
  contentClassName = "w-[var(--radix-dropdown-menu-trigger-width)]"
}: Props) => {
  const { permission } = useOrgPermission();
  const canPickSlackIntegration = permission.can(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Settings
  );
  const addChannel = (channelType: AlertChannelType) =>
    onAdd(
      channelType === AlertChannelType.SlackApp && !canPickSlackIntegration
        ? AlertChannelType.Slack
        : channelType
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" isDisabled={isDisabled}>
          <PlusIcon className="size-4" />
          {label}
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className={contentClassName}>
        {ADD_MENU_CHANNEL_TYPES.map((channelType) => {
          const Icon = getChannelIcon(channelType);
          const isLocked = lockedChannelTypes.includes(channelType);
          return (
            <DropdownMenuItem
              key={channelType}
              onClick={() => (isLocked ? onLockedSelect?.() : addChannel(channelType))}
            >
              <Icon className="size-4" />
              {ALERT_CHANNEL_TYPE_LABELS[channelType]}
              {isLocked && (
                <Badge variant="neutral" className="ml-auto">
                  Enterprise
                </Badge>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
