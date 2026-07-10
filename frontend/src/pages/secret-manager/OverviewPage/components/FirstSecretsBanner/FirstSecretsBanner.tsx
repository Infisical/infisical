import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BotIcon, TerminalIcon, XIcon } from "lucide-react";

import { Button } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";

type Props = {
  projectId: string;
  orgId: string;
  secretPath: string;
};

const DISMISSED_KEY_PREFIX = "first-secrets-banner-dismissed-";
const SEEN_EMPTY_KEY_PREFIX = "first-secrets-seen-empty-";

export function FirstSecretsBanner({ projectId, orgId, secretPath }: Props) {
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem(`${DISMISSED_KEY_PREFIX}${projectId}`) === "true";
  });

  const hasSeenEmpty = localStorage.getItem(`${SEEN_EMPTY_KEY_PREFIX}${projectId}`) === "true";

  const handleDismiss = () => {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${projectId}`, "true");
    setIsDismissed(true);
  };

  if (isDismissed || !hasSeenEmpty || secretPath !== "/") return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-primary-500/20 bg-primary-500/5 px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          Great, you&apos;ve added your first secrets! Now inject them into your apps.
        </p>
        <p className="text-xs text-foreground/75">
          Create a machine identity for programmatic access or use the Infisical CLI to inject
          secrets locally.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="xs" variant="outline" asChild>
          <Link
            to={ROUTE_PATHS.Organization.AccessControlPage.path}
            params={{ orgId }}
            search={{ selectedTab: "identities" }}
          >
            <BotIcon className="mr-1 size-3.5" />
            Create Machine Identity
          </Link>
        </Button>
        <Button size="xs" variant="outline" asChild>
          <a
            href="https://infisical.com/docs/cli/overview"
            target="_blank"
            rel="noopener noreferrer"
          >
            <TerminalIcon className="mr-1 size-3.5" />
            Download CLI
          </a>
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-1 rounded p-1 text-foreground/50 transition-colors hover:text-foreground"
          aria-label="Dismiss banner"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
