import { ChevronDownIcon, PlusIcon } from "lucide-react";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";
import { ALERT_CHANNEL_TYPE_LABELS, AlertChannelType } from "@app/hooks/api/alerts";

import { getChannelIcon } from "./channelIcons";

type Props = {
  onAdd: (channelType: AlertChannelType) => void;
  isDisabled?: boolean;
  lockedChannelTypes?: AlertChannelType[];
  onLockedSelect?: () => void;
};

export const AddChannelMenu = ({
  onAdd,
  isDisabled,
  lockedChannelTypes = [],
  onLockedSelect
}: Props) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" size="sm" isDisabled={isDisabled}>
        <PlusIcon className="size-4" />
        Add Channel
        <ChevronDownIcon className="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
      {Object.values(AlertChannelType).map((channelType) => {
        const Icon = getChannelIcon(channelType);
        const isLocked = lockedChannelTypes.includes(channelType);
        return (
          <DropdownMenuItem
            key={channelType}
            onClick={() => (isLocked ? onLockedSelect?.() : onAdd(channelType))}
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
