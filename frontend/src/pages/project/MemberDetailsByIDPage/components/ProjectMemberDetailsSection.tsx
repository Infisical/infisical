import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { TWorkspaceUser } from "@app/hooks/api/types";

type Props = {
  membership: TWorkspaceUser;
};

export const ProjectMemberDetailsSection = ({ membership }: Props) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/naming-convention
  const [_copyId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/naming-convention
  const [_copyEmail, isCopyingEmail, setCopyEmail] = useTimedReset<string>({
    initialState: "Copy email to clipboard"
  });

  const {
    user: { email, username, firstName, lastName, id: userId }
  } = membership;

  const name = firstName || lastName ? `${firstName} ${lastName}`.trim() : null;

  return (
    <UnstableCard className="w-full lg:max-w-[24rem]">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Details</UnstableCardTitle>
        <UnstableCardDescription>User membership details</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{name || <span className="text-muted">—</span>}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {membership.user.id}
              <Tooltip content="Copy user ID to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(userId);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {/* TODO(scott): color this should be a button variant and create re-usable copy button */}
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Email</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {email}
              <Tooltip content="Copy user email to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(email);
                    setCopyEmail("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {/* TODO(scott): color this should be a button variant and create re-usable copy button */}
                  {isCopyingEmail ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          {username !== email && (
            <Detail>
              <DetailLabel>Username</DetailLabel>
              <DetailValue>{username || <span className="text-muted">—</span>}</DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Joined project</DetailLabel>
            <DetailValue>{format(membership.createdAt, "PPpp")}</DetailValue>
          </Detail>
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  );
};
