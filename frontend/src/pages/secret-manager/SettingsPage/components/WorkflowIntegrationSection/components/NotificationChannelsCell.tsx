import { Ban } from "lucide-react";

import { Badge, Skeleton, TableCell } from "@app/components/v3";

type Props = {
  isLoading: boolean;
  isEnabled: boolean;
  channelNames: string[];
};

export const NotificationChannelsCell = ({ isLoading, isEnabled, channelNames }: Props) => {
  if (isLoading) {
    return (
      <TableCell>
        <Skeleton className="h-5 w-24" />
      </TableCell>
    );
  }

  if (!isEnabled) {
    return (
      <TableCell>
        <Badge variant="neutral">
          <Ban />
          Disabled
        </Badge>
      </TableCell>
    );
  }

  if (!channelNames.length) {
    return (
      <TableCell>
        <span className="text-muted">No channels selected</span>
      </TableCell>
    );
  }

  return (
    <TableCell className="max-w-0">
      <p className="truncate" title={channelNames.join(", ")}>
        {channelNames.join(", ")}
      </p>
    </TableCell>
  );
};
