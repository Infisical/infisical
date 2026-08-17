import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ExternalLinkIcon, HouseIcon, InfoIcon, LockIcon } from "lucide-react";

import { Badge } from "../../generic/Badge";
import { Button } from "../../generic/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../generic/Dialog";
import { cn } from "../../utils";

const RBAC_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls";

// Fixed widths, not randomized ones, so the backdrop reads as a uniform redaction pattern
// rather than implying a specific number or shape of records the viewer is missing.
const REDACTED_ROW_WIDTHS = ["w-48", "w-64", "w-40", "w-56", "w-44", "w-60", "w-52", "w-36"];

// The gated page can't be rendered behind the dialog — its queries would 403, and the suspense
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
 * Page- and tab-level permission gate, styled to the ErrorPage/ForbiddenPage family. Leaves the
 * surrounding page chrome visible and interactive (the dialog is deliberately non-modal, so the
 * sidebar and sibling tabs still work) and floats the explanation over a redacted stand-in for
 * the content.
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
  const monoRows: [string, string][] = [
    ...(requirement
      ? ([["requires", `${requirement.action} on ${requirement.subject}`]] as [string, string][])
      : []),
    ["route", window.location.pathname]
  ];

  return (
    <div className={cn("relative w-full py-2", className)}>
      <RedactedBackdrop />
      {/* Held open with no onOpenChange: this is a page state, not a dismissible dialog. */}
      <Dialog open modal={false}>
        <DialogContent showCloseButton={false} className="max-w-2xl gap-5">
          <DialogHeader className="items-start gap-5">
            <Badge variant="warning" className="h-6 px-2">
              <LockIcon />
              Access Restricted
            </Badge>
            <DialogTitle className="text-3xl leading-tight font-semibold">
              {title}
              <br />
              <span className="text-2xl">{subtitle}</span>
            </DialogTitle>
            <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
