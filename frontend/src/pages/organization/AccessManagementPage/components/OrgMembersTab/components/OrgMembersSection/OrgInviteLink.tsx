import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { IconButton, Tooltip } from "@app/components/v2";
import { useToggle } from "@app/hooks";

type Props = {
  invite: { email: string; link: string };
};

export const OrgInviteLink = ({ invite }: Props) => {
  const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);

  const copyTokenToClipboard = async () => {
    if (isInviteLinkCopied) return;

    try {
      // navigator.clipboard requires a secure context (HTTPS or localhost).
      // Self-hosted deployments served over plain HTTP will throw here.
      await navigator.clipboard.writeText(invite.link);
    } catch {
      // Fallback for non-secure contexts: create a temporary textarea,
      // select its contents and use the legacy execCommand API.
      const textarea = document.createElement("textarea");
      textarea.value = invite.link;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

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
      <div className="flex flex-col gap-1 rounded-md bg-white/4 p-2 text-base text-gray-400">
        <p
          className={twMerge(
            "mr-4 line-clamp-1",
            window.isSecureContext ? "overflow-hidden text-ellipsis whitespace-nowrap" : "break-all"
          )}
        >
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
