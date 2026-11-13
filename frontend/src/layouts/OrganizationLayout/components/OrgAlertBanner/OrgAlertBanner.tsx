import { ReactNode } from "react";
import { ExternalLinkIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { useToggle } from "@app/hooks";

type Props = {
  text: ReactNode;
  link?: string;
  action?: ReactNode;
  role?: "status" | "alert";
  isDismissible?: boolean;
  onDismiss?: () => void;
};

export const OrgAlertBanner = ({
  text,
  link,
  action,
  role = "status",
  isDismissible = true,
  onDismiss
}: Props) => {
  const [isDismissed, setIsDismissed] = useToggle(false);

  if (isDismissed) return null;

  return (
    <div
      role={role}
      className="flex w-full items-start gap-2 border-b border-warning/20 bg-warning/5 px-4 py-2 text-sm text-foreground"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        {text}{" "}
        {link && (
          <a
            href={link}
            rel="noopener noreferrer"
            target="_blank"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-warning"
          >
            Configuration documentation
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </p>
      {action && <div className="-my-1 shrink-0">{action}</div>}
      {isDismissible && (
        <IconButton
          className="-my-1 -mr-1"
          aria-label="Dismiss warning"
          variant="ghost-muted"
          size="xs"
          onClick={onDismiss ?? setIsDismissed.on}
        >
          <XIcon />
        </IconButton>
      )}
    </div>
  );
};
