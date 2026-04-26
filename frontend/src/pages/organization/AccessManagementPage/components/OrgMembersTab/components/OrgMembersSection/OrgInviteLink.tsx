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

    const copied = await copyTextToClipboard(invite.link);

    if (!copied) {
      createNotification({
        type: "error",
        text: "Failed to copy invitation link. Please copy it manually."
      });
      return;
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  // Modern Clipboard API — only available in secure contexts (HTTPS or localhost)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // Legacy fallback using a temporary textarea and execCommand — works on HTTP
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
