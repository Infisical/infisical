import { ExternalLinkIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { useToggle } from "@app/hooks";

type Props = {
  text: string;
  link?: string;
};

export const OrgAlertBanner = ({ text, link }: Props) => {
  const [isDismissed, setIsDismissed] = useToggle(false);

  if (isDismissed) return null;

  return (
    <div
      role="status"
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
      <IconButton
        className="-my-1 -mr-1"
        aria-label="Dismiss warning"
        variant="ghost-muted"
        size="xs"
        onClick={() => setIsDismissed.on()}
      >
        <XIcon />
      </IconButton>
    </div>
  );
};
