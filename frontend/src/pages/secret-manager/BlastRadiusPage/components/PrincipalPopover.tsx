import { Link } from "@tanstack/react-router";
import { KeyIcon, ShieldIcon, UsersIcon, XIcon } from "lucide-react";

import { Badge, IconButton, Separator } from "@app/components/v3";
import {
  PrincipalType,
  ReadPrecision,
  SecretActionName,
  TBlastRadiusPrincipal,
  TGrantPath
} from "@app/hooks/api/blastRadius";

import {
  CALLER_KIND_LABEL,
  CLIENT_LABEL,
  formatReadCount,
  PRECISION_LABEL,
  relativeTime
} from "../utils/format";

export type TPrincipalPopoverActions = {
  accessHref: string;
  roleHref: (roleSlug: string) => string;
};

type Props = {
  principal: TBlastRadiusPrincipal;
  windowDays: number;
  consumptionAvailable: boolean;
  actions: TPrincipalPopoverActions;
  onClose: () => void;
};

const stepKey = (step: TGrantPath["via"][number]) => {
  if (step.kind === "group") return `group-${step.groupId}`;
  if (step.kind === "additionalPrivilege") return `privilege-${step.privilegeId}`;
  return `role-${step.roleSlug ?? step.roleName}`;
};

const StepIcon = ({ kind }: { kind: TGrantPath["via"][number]["kind"] }) => {
  if (kind === "group") return <UsersIcon size={12} className="text-accent" />;
  if (kind === "additionalPrivilege") return <KeyIcon size={12} className="text-accent" />;
  return <ShieldIcon size={12} className="text-accent" />;
};

const roleLabel = (step: TGrantPath["via"][number]) =>
  step.kind === "role" ? (step.roleSlug ?? step.roleName) : undefined;

/** The role the header sentence names, so the chain below does not repeat it. */
const primaryRoleLabel = (principal: TBlastRadiusPrincipal) =>
  principal.grantPaths
    .flatMap((path) => path.via)
    .map(roleLabel)
    .find(Boolean);

/**
 * A step worth drawing in the chain. The role the sentence already names is dropped: repeating it made the
 * common case a card that said one thing twice. A role with an expiry stays, because the sentence cannot
 * carry "and it expires on Friday".
 */
const isRedundantStep = (step: TGrantPath["via"][number], namedRole?: string) =>
  step.kind === "role" && !step.isTemporary && roleLabel(step) === namedRole;

/** The sentence a reader needs before the detail: what this principal can do, and by how many routes. */
const describeAccess = (principal: TBlastRadiusPrincipal) => {
  const canReadValue =
    principal.actions.includes(SecretActionName.ReadValue) ||
    principal.actions.includes(SecretActionName.DescribeAndReadValue);
  const verb = canReadValue ? "Reads the value" : "Can see this secret but not its value";

  const namedRole = primaryRoleLabel(principal);
  const via = namedRole ? ` through role ${namedRole}` : "";

  if (!principal.grantPaths.length) return `${verb}${via}.`;

  // More than one route matters: removing one leaves the others in place.
  const paths =
    principal.grantPaths.length === 1
      ? "One access path."
      : `${principal.grantPaths.length} independent access paths.`;

  return `${verb}${via}. ${paths}`;
};

const GrantChain = ({
  path,
  index,
  total,
  namedRole
}: {
  path: TGrantPath;
  index: number;
  total: number;
  namedRole?: string;
}) => {
  const steps = path.via.filter((step) => !isRedundantStep(step, namedRole));

  // With the named role removed, a plain single-role grant has nothing left to show and the card would be an
  // empty box repeating the sentence above it.
  if (!steps.length && !path.conditions.length) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-container p-2.5">
      {total > 1 && (
        <span className="text-xs tracking-wide text-muted uppercase">
          Path {index + 1} ·{" "}
          {path.via.some((step) => step.kind === "group") ? "via group" : "direct assignment"}
        </span>
      )}

      <ol className="flex flex-col gap-1">
        {steps.map((step) => (
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
                  <Badge variant="warning">
                    expires {new Date(step.expiresAt).toLocaleString()}
                  </Badge>
                )}
              </>
            )}
            {step.kind === "additionalPrivilege" && (
              <>
                <span className="text-accent">Additional privilege</span>
                <span className="font-medium">{step.name}</span>
              </>
            )}
          </li>
        ))}
      </ol>

      {Boolean(path.conditions.length) && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-1.5">
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
};

export const PrincipalPopover = ({
  principal,
  windowDays,
  consumptionAvailable,
  actions,
  onClose
}: Props) => {
  const { observed } = principal;
  const readCount = observed?.readCount ?? 0;
  const namedRole = primaryRoleLabel(principal);
  const hasChainToShow = principal.grantPaths.some(
    (path) => path.conditions.length || path.via.some((step) => !isRedundantStep(step, namedRole))
  );
  const roleStep = principal.grantPaths
    .flatMap((path) => path.via)
    .find((step) => step.kind === "role");

  return (
    <div className="flex w-80 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-mono text-sm text-foreground">{principal.name}</p>
          {principal.type === PrincipalType.Group && (
            <span className="text-xs text-muted">group of {principal.memberCount ?? 0}</span>
          )}
        </div>
        <IconButton variant="ghost" size="xs" aria-label="Close" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>

      <p className="text-xs leading-snug text-accent">{describeAccess(principal)}</p>

      <div className="flex flex-col gap-1.5">
        {consumptionAvailable && readCount > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xl leading-none text-foreground">
              {formatReadCount(readCount, observed?.precision ?? null)}
            </span>
            <span className="text-xs text-accent">
              {readCount === 1 ? "read" : "reads"}
              {observed?.lastReadAt ? ` · ${relativeTime(observed.lastReadAt)}` : ""}
            </span>
          </div>
        )}

        {consumptionAvailable && readCount === 0 && (
          <p className="text-xs text-muted">
            {observed?.lastReadOutsideWindow && observed.lastReadAt
              ? `Last read ${relativeTime(observed.lastReadAt)}, outside the window.`
              : `No reads in ${windowDays}d.`}
          </p>
        )}

        {!consumptionAvailable && (
          <p className="text-xs text-muted">Read activity is hidden for your role.</p>
        )}

        {(observed?.precision || Boolean(observed?.clients.length)) && (
          <div className="flex flex-wrap items-center gap-1">
            {observed?.precision && (
              <Badge variant="ghost" className="text-muted italic">
                {PRECISION_LABEL[observed.precision]}
              </Badge>
            )}
            {observed?.clients.map((client) => (
              <Badge
                key={client}
                variant={client === "web" ? "info" : "neutral"}
                className="font-mono"
              >
                {CLIENT_LABEL[client] ?? client}
              </Badge>
            ))}
          </div>
        )}

        {observed?.precision === ReadPrecision.Folder && (
          <p className="text-xs leading-snug text-muted">
            Bulk reads are recorded against the folder and cannot be attributed to one key.
          </p>
        )}

        {/* Who was actually behind the identity. Only AWS, Kubernetes and OIDC auth prove this, so most
            machine identities show nothing here, and that absence is the honest answer rather than a gap. */}
        {Boolean(observed?.callers.length) && (
          <div className="flex flex-col gap-1 border-t border-border pt-1.5">
            <span className="text-xs text-accent">
              {observed!.callerCount === 1 ? "Called by" : `Called by ${observed!.callerCount}`}
            </span>
            {observed!.callers.map((caller) => (
              <div key={`${caller.kind}-${caller.label}`} className="flex items-baseline gap-1.5">
                <Badge variant="neutral">{CALLER_KIND_LABEL[caller.kind]}</Badge>
                <span className="truncate font-mono text-xs text-foreground" title={caller.detail}>
                  {caller.label}
                </span>
              </div>
            ))}
            {observed!.callerCount > observed!.callers.length && (
              <span className="text-xs text-muted">
                +{observed!.callerCount - observed!.callers.length} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* `GrantChain` returns null for a path the sentence above already covers, so this collapses to nothing
          for the common single-role grant rather than leaving an empty container and its gap. */}
      {hasChainToShow && (
        <div className="flex flex-col gap-1.5">
          {principal.grantPaths.map((path, index) => (
            <GrantChain
              key={path.sourceId}
              path={path}
              index={index}
              total={principal.grantPaths.length}
              namedRole={namedRole}
            />
          ))}
        </div>
      )}

      <Separator />

      {/* These navigate rather than mutate. Revoking access from a read-only graph would put a
          destructive action two clicks from a hover, and the role editor and access page already own
          those flows with their guards and approval paths. */}
      <div className="flex items-center justify-end gap-3 text-xs">
        {roleStep?.kind === "role" && (
          <Link
            to={actions.roleHref(roleStep.roleSlug ?? roleStep.roleName)}
            className="text-accent hover:underline"
          >
            Restrict
          </Link>
        )}
        <Link to={actions.accessHref} className="text-danger hover:underline">
          Remove
        </Link>
      </div>
    </div>
  );
};
