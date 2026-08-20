import { ReactNode, useId } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ExternalLinkIcon, HouseIcon, InfoIcon, LockIcon } from "lucide-react";

import { Badge } from "../../generic/Badge";
import { Button } from "../../generic/Button";
import { cn } from "../../utils";

const RBAC_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls";

// Fixed widths, not randomized ones, so the backdrop reads as a uniform redaction pattern
// rather than implying a specific number or shape of records the viewer is missing.
const REDACTED_ROW_WIDTHS = ["w-48", "w-64", "w-40", "w-56", "w-44", "w-60", "w-52", "w-36"];

// The gated page can't be rendered behind the panel — its queries would 403, and the suspense
// ones would escalate into the router error boundary — so the region keeps page-shaped volume
// with inert bars instead.
const RedactedBackdrop = () => (
  <div
    aria-hidden
    className="pointer-events-none w-full [mask-image:linear-gradient(to_bottom,black_65%,transparent_100%)] select-none"
  >
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 blur-[2px]">
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-44 rounded-xs bg-foreground/25" />
        <div className="h-8 w-28 rounded-md bg-foreground/10" />
      </div>
      <div className="h-9 w-full rounded-md bg-container" />
      <div className="flex flex-col">
        {REDACTED_ROW_WIDTHS.map((width) => (
          <div key={width} className="flex items-center gap-4 border-t border-border py-4">
            <div className="size-3.5 shrink-0 rounded-xs bg-foreground/15" />
            <div className={cn("h-3 rounded-xs bg-foreground/20", width)} />
            <div className="ml-auto h-3 w-16 rounded-xs bg-foreground/12" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export type TAccessRestrictedRequirement = {
  action: string;
  subject: string;
};

// CASL allows non-string subjects (class refs, tagged objects), and permission gates are typed
// loosely enough to pass one through. Only render the requirement when both halves are printable.
export const toPermissionRequirement = (
  action: unknown,
  subject: unknown
): TAccessRestrictedRequirement | undefined =>
  typeof action === "string" && typeof subject === "string" ? { action, subject } : undefined;

type Props = {
  // First line of the two-line heading, matching the error-page family.
  title?: string;
  subtitle?: string;
  description?: ReactNode;
  // The CASL action/subject the viewer is missing. Shown verbatim so an operator can hand it to
  // whoever edits their role.
  requirement?: TAccessRestrictedRequirement;
  docsUrl?: string;
  // Extra call to action rendered after "Back to Home" — e.g. a request-access flow on the
  // surfaces that have one.
  action?: ReactNode;
  className?: string;
};

/**
 * Page- and tab-level permission gate, styled to the ErrorPage/ForbiddenPage family: a
 * dialog-look panel floating over a redacted stand-in for the content. It renders in normal
 * document flow, so the surrounding page chrome (sidebar, sibling tabs) stays usable by both
 * pointer and keyboard.
 *
 * For a single section inside an otherwise usable page, use AccessRestrictedNotice instead.
 */
export const AccessRestrictedDialog = ({
  title = "You're one permission away.",
  subtitle = "An admin can grant it.",
  description = "Your role doesn't include the permission this page requires.",
  requirement,
  docsUrl = RBAC_DOCS_URL,
  action,
  className
}: Props) => {
  const titleId = useId();

  const monoRows: [string, string][] = [
    ...(requirement
      ? ([["requires", `${requirement.action} on ${requirement.subject}`]] as [string, string][])
      : []),
    ["route", window.location.pathname]
  ];

  // Deliberately NOT a real <Dialog>: this is a permanent page state with no close affordance,
  // and Radix DialogContent hardcodes a Tab loop (FocusScope loop) plus mount autofocus even
  // when non-modal, so keyboard focus would be pulled in and could never reach the page chrome
  // again. The grid stacks panel over backdrop so the gate is as tall as the larger of the two.
  return (
    <div className={cn("grid w-full py-2", className)}>
      <div className="col-start-1 row-start-1">
        <RedactedBackdrop />
      </div>
      {/* relative: the backdrop's blur filter forms a stacking context that would otherwise
          paint over this statically-positioned cell. */}
      <div className="relative col-start-1 row-start-1 flex items-center justify-center p-4">
        <section
          aria-labelledby={titleId}
          className="flex w-full max-w-2xl animate-in flex-col gap-5 rounded-lg border border-border bg-popover p-6 pb-0 text-foreground shadow-lg duration-200 fade-in-0 zoom-in-95"
        >
          <div className="flex flex-col items-start gap-5 text-left">
            <Badge variant="warning" className="h-6 px-2">
              <LockIcon />
              Access Restricted
            </Badge>
            {/* Alliance ships only weight 400, so font-normal rather than a faux-bolded semibold. */}
            <h2 id={titleId} className="font-alliance text-3xl leading-tight font-normal">
              {title}
              <br />
              <span className="text-2xl">{subtitle}</span>
            </h2>
            <p className="text-sm leading-relaxed text-accent">{description}</p>
          </div>
          <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bunker-800/50 px-4 py-3">
            {monoRows.map(([key, value]) => (
              <div key={key} className="flex gap-4 font-mono text-xs">
                <span className="w-16 shrink-0 text-muted">{key}</span>
                <span className="break-all text-label">{value}</span>
              </div>
            ))}
          </div>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1.5 text-xs text-info transition-colors hover:text-info/75"
          >
            <InfoIcon className="size-3.5" />
            Access control documentation
            <ExternalLinkIcon className="size-3" />
          </a>
          <div className="-mx-6 flex flex-row flex-wrap justify-end gap-2 rounded-b-lg border-t border-border bg-container p-4">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeftIcon />
              Go Back
            </Button>
            <Button variant="neutral" asChild>
              <Link to="/">
                <HouseIcon />
                Back to Home
              </Link>
            </Button>
            {action}
          </div>
        </section>
      </div>
    </div>
  );
};
