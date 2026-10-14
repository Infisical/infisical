import { formatDistanceToNow } from "date-fns";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SecretReadStatus } from "@app/hooks/api/secrets/types";

type Props = {
  status: SecretReadStatus;
  lastReadAt?: string | null;
};

export const SecretReadStatusBadge = ({ status, lastReadAt }: Props) => {
  if (status === SecretReadStatus.Read && lastReadAt) {
    return <span>{formatDistanceToNow(new Date(lastReadAt))} ago</span>;
  }
  if (status === SecretReadStatus.PossiblyRead && lastReadAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warning">Possibly read</Badge>
        </TooltipTrigger>
        <TooltipContent>
          A parent folder was read {formatDistanceToNow(new Date(lastReadAt))} ago. That returns
          this secret only if the read was recursive.
        </TooltipContent>
      </Tooltip>
    );
  }
  return <Badge variant="danger">No reads</Badge>;
};
