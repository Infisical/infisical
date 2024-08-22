import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { IconButton, Tooltip } from "@app/components/v2";
import { useToggle } from "@app/hooks";

type Props = {
  invite: { email: string; link: string };
};

export const OrgInviteLink = ({ invite }: Props) => {
  const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);

  const copyTokenToClipboard = () => {
    if (isInviteLinkCopied) return;

    navigator.clipboard.writeText(invite.link);
    setInviteLinkCopied.timedToggle();

    createNotification({
      type: "info",
      text: "Copied invitation link to clipboard"
    });
  };

  return (
    <div key={`invite-${invite.email}`}>
      <p className="text-sm text-mineshaft-400">
        Invite for <span className="font-medium">{invite.email}</span>
      </p>
      <div className="flex flex-col gap-1 rounded-md bg-white/[0.04] p-2 text-base text-gray-400">
        <p className="line-clamp-1 mr-4 overflow-hidden text-ellipsis whitespace-nowrap	">
          {invite.link}
        </p>
        <Tooltip content={`Copy invitation link for ${invite.email}`}>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => copyTokenToClipboard()}
          >
            <FontAwesomeIcon icon={isInviteLinkCopied ? faCheck : faCopy} />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};
