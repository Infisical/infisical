import * as React from "react";

import { Button } from "../ui/button";
import { CodeBlock } from "../ui/code-block";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Icon } from "../ui/icon";
import { CopyButton } from "../ui/sensitive-editor";
import { Heading, Text } from "../ui/text";
import { useAppShell } from "../ui/top-bar";

import styles from "./error-state.module.css";

export type ErrorStatePreset = "not-found" | "forbidden" | "crash";
export type ErrorStateLayout = "auto" | "in-shell" | "full-page";
export type ErrorStateDetail = { label: string; value: string };

export type ErrorStateProps = {
  preset: ErrorStatePreset;
  /** auto renders in the content area when an AppShell is above it, and full-page (fixed over its containing block, the viewport in the app) when there is none, such as when the shell itself failed. */
  layout?: ErrorStateLayout;
  description?: string;
  /** The caught error. crash shows its name and message under Error details. */
  error?: unknown;
  /** Extra lines for Error details and the copied report, such as the request id, status, route and time. */
  details?: readonly ErrorStateDetail[];
  /** Adds the stack to Error details. Defaults to development builds only. */
  showStack?: boolean;
  homeHref?: string;
  /** Runs on Go to organization home before the link navigates; call preventDefault to route in-app. */
  onHome?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onBack?: () => void;
  onReload?: () => void;
  /** Called once per error when crash mounts, to send it to error reporting. */
  onReport?: (error: unknown) => void;
  /** The page's own flows, such as Request access. They sit after the preset's primary action and before its secondary one; keep them outline so the primary stays the one accent. */
  actions?: React.ReactNode;
};

const presets = {
  "not-found": {
    title: "Page not found",
    description: "The link may be broken, or the page was moved or removed."
  },
  forbidden: {
    title: "You don't have access",
    description: "Your role doesn't include access to this page. An admin can grant it."
  },
  crash: {
    title: "Something went wrong",
    description: "This page hit an error. Reload to try again."
  }
} as const;

const markCells = 12;
const markTarget = 6;

export function ErrorState({
  preset,
  layout = "auto",
  description,
  error,
  details = [],
  showStack = import.meta.env.DEV,
  homeHref = "/",
  onHome,
  onBack = () => window.history.back(),
  onReload = () => window.location.reload(),
  onReport,
  actions
}: ErrorStateProps) {
  const shell = useAppShell();
  const fullPage = layout === "full-page" || (layout === "auto" && !shell);
  const crash = preset === "crash";
  const report = React.useEffectEvent((reported: unknown) => onReport?.(reported));
  React.useEffect(() => {
    if (crash && error !== undefined) report(error);
  }, [crash, error]);

  const name = error instanceof Error ? error.name : "Error";
  let message = "";
  if (error instanceof Error) message = error.message;
  else if (error !== undefined && error !== null) message = String(error);
  const stack = showStack && error instanceof Error ? error.stack : undefined;
  const reportText = [
    `error: ${name}`,
    message && `message: ${message}`,
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    stack && `\n${stack}`
  ]
    .filter(Boolean)
    .join("\n");

  const home = (
    <Button variant={crash ? "outline" : "accent"} asChild>
      <a href={homeHref} onClick={onHome}>
        Go to organization home
      </a>
    </Button>
  );

  return (
    <div
      data-slot="error-state"
      data-preset={preset}
      data-layout={fullPage ? "full-page" : "in-shell"}
      className={styles.root}
    >
      <div className={styles.body}>
        <div className={styles.mark} aria-hidden="true">
          {Array.from({ length: markCells }, (_, index) => (
            <span key={index} data-target={index === markTarget || undefined} />
          ))}
        </div>
        <div className={styles.copy}>
          <Heading level={1} size="section">
            {presets[preset].title}
          </Heading>
          <Text muted>{description ?? presets[preset].description}</Text>
        </div>
        <div className={styles.actions}>
          {crash ? (
            <>
              <Button variant="accent" onClick={onReload}>
                Reload
              </Button>
              {actions}
              {home}
            </>
          ) : (
            <>
              {home}
              {actions}
              <Button variant="outline" onClick={onBack}>
                Go back
              </Button>
            </>
          )}
        </div>
        {crash && (
          <Collapsible className={styles.details}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className={styles.detailsTrigger}>
                <Icon name="chev-right" data-chevron="" />
                Error details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className={styles.detailsPanel}>
              <CodeBlock code={reportText} copyable={false} />
              <span className={styles.detailsCopy}>
                <CopyButton value={reportText} label="Copy details" iconOnly />
              </span>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
ErrorState.displayName = "ErrorState";
