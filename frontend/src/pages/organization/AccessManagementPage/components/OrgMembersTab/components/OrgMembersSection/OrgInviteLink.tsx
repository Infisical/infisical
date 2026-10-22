import { useRef } from "react";
import { Check, Copy } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  ButtonGroup,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { copyToClipboard } from "@app/helpers/clipboard";
import { useToggle } from "@app/hooks";

type Props = {
  invite: { email: string; link: string };
};

export const OrgInviteLink = ({ invite }: Props) => {
  const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);
  const isCopying = useRef(false);

  const copyLinkToClipboard = async () => {
    if (isInviteLinkCopied || isCopying.current) return;
    isCopying.current = true;

    try {
      await copyToClipboard(invite.link);
      setInviteLinkCopied.on();
      setTimeout(setInviteLinkCopied.off, 2000);

      createNotification({
        type: "info",
        text: "Copied invitation link to clipboard"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Could not copy the invitation link. Please copy it manually."
      });
    } finally {
      isCopying.current = false;
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor={`invite-link-${invite.email}`}>
        Invite for <span className="font-medium text-foreground">{invite.email}</span>
      </FieldLabel>
      <ButtonGroup className="w-full">
        <Input
          id={`invite-link-${invite.email}`}
          value={invite.link}
          readOnly
          aria-label={`Invitation link for ${invite.email}`}
          className="font-mono"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="outline"
              aria-label={`Copy invitation link for ${invite.email}`}
              onClick={copyLinkToClipboard}
            >
              {isInviteLinkCopied ? <Check /> : <Copy />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{isInviteLinkCopied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </Field>
  );
};
