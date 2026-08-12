import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, KeyIcon, ShieldIcon, UsersIcon } from "lucide-react";

import {
  Badge,
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { PrincipalType, TBlastRadiusPrincipal, TGrantPath } from "@app/hooks/api/blastRadius";

import {
  describeObserved,
  PRECISION_LABEL,
  SECRET_ACTION_LABEL,
  strongestActionLabel
} from "../utils/format";

type Props = {
  principal?: TBlastRadiusPrincipal;
  windowDays: number;
  consumptionAvailable: boolean;
  auditLogHref: string;
  accessHref: string;
  roleHref: (roleSlug: string) => string;
  onClose: () => void;
};

const StepIcon = ({ kind }: { kind: TGrantPath["via"][number]["kind"] }) => {
  if (kind === "group") return <UsersIcon size={12} className="text-accent" />;
  if (kind === "additionalPrivilege") return <KeyIcon size={12} className="text-accent" />;
  return <ShieldIcon size={12} className="text-accent" />;
};

const stepKey = (step: TGrantPath["via"][number]) => {
  if (step.kind === "group") return `group-${step.groupId}`;
  if (step.kind === "additionalPrivilege") return `privilege-${step.privilegeId}`;
  return `role-${step.roleSlug ?? step.roleName}`;
};

const GrantChain = ({ path, index, total }: { path: TGrantPath; index: number; total: number }) => (
  <div className="flex flex-col gap-2 rounded-sm border border-border bg-container p-3">
    {total > 1 && (
      <span className="text-xs tracking-wide text-muted uppercase">
        Path {index + 1} ·{" "}
        {path.via.some((step) => step.kind === "group") ? "via group" : "direct assignment"}
      </span>
    )}

    <ol className="flex flex-col gap-1.5">
      {path.via.map((step) => (
        <li key={stepKey(step)} className="flex items-center gap-2 text-xs text-foreground">
          <StepIcon kind={step.kind} />
          {step.kind === "group" && (
            <>
              <span className="text-accent">Member of group</span>
              <span className="font-medium">{step.groupName}</span>
            </>
          )}
          {step.kind === "role" && (
            <>
              <span className="text-accent">Holds role</span>
              <span className="font-mono">{step.roleSlug ?? step.roleName}</span>
              {step.isTemporary && step.expiresAt && (
                <Badge variant="warning">expires {new Date(step.expiresAt).toLocaleString()}</Badge>
              )}
            </>
          )}
          {step.kind === "additionalPrivilege" && (
            <>
              <span className="text-accent">Additional privilege</span>
              <span className="font-medium">{step.name}</span>
              {step.isTemporary && step.expiresAt && (
                <Badge variant="warning">expires {new Date(step.expiresAt).toLocaleString()}</Badge>
              )}
            </>
          )}
        </li>
      ))}
    </ol>

    {Boolean(path.conditions.length) && (
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <span className="text-xs text-accent">Matched rule</span>
        {/* The rule CASL actually used to decide, rendered rather than re-derived. */}
        {path.conditions.map((condition) => (
          <code
            key={`${condition.field}-${condition.operator}`}
            className="font-mono text-xs text-foreground"
          >
            {condition.field} <span className="text-secret">{condition.operator}</span>{" "}
            {JSON.stringify(condition.value)}
          </code>
        ))}
      </div>
    )}
  </div>
);

export const ExplainPanel = ({
  principal,
  windowDays,
  consumptionAvailable,
  auditLogHref,
  accessHref,
  roleHref,
  onClose
}: Props) => (
  <Sheet open={Boolean(principal)} onOpenChange={(open) => !open && onClose()}>
    <SheetContent side="right" className="w-[26rem] gap-0 sm:max-w-md">
      {principal && (
        <>
          <SheetHeader>
            <SheetTitle className="truncate">{principal.name}</SheetTitle>
            <SheetDescription>
              {principal.type === PrincipalType.Group
                ? `Group of ${principal.memberCount ?? 0}. Everything it grants reaches every member.`
                : `Can ${strongestActionLabel(principal.actions).toLowerCase()}. ${
                    principal.grantPaths.length > 1
                      ? `Access comes from ${principal.grantPaths.length} independent paths, so removing one leaves the others.`
                      : "Access comes from one path."
                  }`}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 overflow-y-auto p-4">
            <div className="flex flex-wrap gap-1">
              {principal.actions.map((action) => (
                <Badge key={action} variant="neutral">
                  {SECRET_ACTION_LABEL[action] ?? action}
                </Badge>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs tracking-wide text-accent uppercase">
                Access paths · {principal.grantPaths.length}
              </span>
              {principal.grantPaths.length ? (
                principal.grantPaths.map((path, index) => (
                  <GrantChain
                    key={path.sourceId}
                    path={path}
                    index={index}
                    total={principal.grantPaths.length}
                  />
                ))
              ) : (
                <p className="text-xs text-muted">
                  Paths for this principal were not resolved in this page of results.
                </p>
              )}
            </div>

            {Boolean(principal.members?.length) && (
              <>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs tracking-wide text-accent uppercase">
                    Members · {principal.memberCount ?? principal.members?.length}
                  </span>
                  {/* Expanded here rather than on the canvas: a group of 40 would push every other node
                      off screen, and the panel keeps the graph stable while you read the list. */}
                  <ul className="flex flex-wrap gap-1">
                    {principal.members?.map((member) => (
                      <li key={member.id}>
                        <Badge variant="ghost" className="text-accent">
                          {member.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  {principal.memberCount !== undefined &&
                    principal.members !== undefined &&
                    principal.memberCount > principal.members.length && (
                      <p className="text-xs text-muted">
                        Showing {principal.members.length} of {principal.memberCount}. Every member
                        inherits everything the group grants.
                      </p>
                    )}
                </div>
              </>
            )}

            <Separator />

            <div className="flex flex-col gap-1">
              <span className="text-xs tracking-wide text-accent uppercase">
                Observed reads · {windowDays}d
              </span>
              <p className="text-xs text-foreground">
                {describeObserved(principal.observed, windowDays, consumptionAvailable)}
              </p>
              {principal.observed?.precision && (
                <p className="text-xs text-muted">
                  Precision: {PRECISION_LABEL[principal.observed.precision]}.{" "}
                  {principal.observed.precision === "folder"
                    ? "Bulk reads are recorded against the folder and cannot be attributed to one key."
                    : "These reads named this key."}
                </p>
              )}
              {Boolean(principal.observed?.clients.length) && (
                <div className="mt-1 flex gap-1">
                  {principal.observed?.clients.map((client) => (
                    <Badge
                      key={client}
                      variant={client === "web" ? "info" : "ghost"}
                      className="font-mono"
                    >
                      {client}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* These navigate rather than mutate. Revoking access from a read-only graph would be a
              destructive action two clicks from a hover, and the role editor and access page already
              own those flows with their own guards and approval paths. */}
          <div className="mt-auto flex flex-wrap gap-2 border-t border-border p-4">
            {principal.grantPaths[0]?.via.find((step) => step.kind === "role")?.kind === "role" && (
              <Button size="xs" variant="outline" asChild>
                <Link
                  to={roleHref(
                    (
                      principal.grantPaths[0].via.find((step) => step.kind === "role") as {
                        roleSlug?: string;
                        roleName: string;
                      }
                    ).roleSlug ??
                      (
                        principal.grantPaths[0].via.find((step) => step.kind === "role") as {
                          roleName: string;
                        }
                      ).roleName
                  )}
                >
                  Edit Role
                  <ArrowRightIcon />
                </Link>
              </Button>
            )}
            <Button size="xs" variant="outline" asChild>
              <Link to={accessHref}>
                Manage Access
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button size="xs" variant="ghost" asChild>
              <Link to={auditLogHref}>
                View Audit Log
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </>
      )}
    </SheetContent>
  </Sheet>
);
