import { Fragment } from "react";
import { BanIcon, CheckIcon, ChevronRightIcon } from "lucide-react";

import { TableCell, TableRow } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import {
  getActionState,
  getPermissionRow,
  isActionListed,
  setActionAllowed,
  setActionDenied,
  SUBJECTS_WITHOUT_DENY,
  TAgentVaultPolicy,
  TPermissionAction,
  TPermissionScope
} from "./agentVaultPolicyModel";
import { LevelSelect, TLevelOption } from "./LevelSelect";

// Indents a sub-row's label under the row above it, inside the cell's own padding.
const SUB_ROW_INDENT = "pl-8";
// A darker shade sets the actions apart from the card's rows around them. No surface token is darker than the
// table's in both themes, so this shades whatever is below.
const SUB_ROW = "bg-black/15";

/** Shows or hides a Custom row's actions. Rows that aren't Custom keep the same space empty, so names line up. */
export const ExpandToggle = ({
  isVisible,
  isExpanded,
  label,
  onToggle
}: {
  isVisible: boolean;
  isExpanded: boolean;
  label: string;
  onToggle: () => void;
}) =>
  isVisible ? (
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Hide" : "Show"} the actions of ${label}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      onClick={onToggle}
    >
      <ChevronRightIcon
        className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")}
      />
    </button>
  ) : (
    <span className="block size-5 shrink-0" />
  );

const NOT_ALLOWED = "not-allowed";
const ALLOWED = "allowed";
const DENIED = "denied";

// A deny on one service or skill only stops it being picked on its own: an access bundle that holds it still gives it.
const DENY_REACHES_BUNDLES = new Set(["services", "skills"]);

const optionsFor = (
  scope: TPermissionScope,
  action: TPermissionAction,
  { allowLock, denyLock, isDenied }: ReturnType<typeof getActionState>
): TLevelOption[] => {
  const canBeDenied = !SUBJECTS_WITHOUT_DENY.has(action.subject);
  // An inherited deny can't be lifted here, so while it holds the other choices give its reason.
  const heldByDeny = isDenied ? denyLock : undefined;
  return [
    {
      value: NOT_ALLOWED,
      label: <span className="text-muted">Not Allowed</span>,
      description: heldByDeny ?? allowLock ?? "Another role can still allow it",
      isDisabled: Boolean(heldByDeny ?? allowLock)
    },
    {
      value: ALLOWED,
      label: (
        <span className="flex items-center gap-1.5">
          <CheckIcon className="text-success" />
          Allowed
        </span>
      ),
      description: heldByDeny,
      isDisabled: Boolean(heldByDeny)
    },
    ...(canBeDenied
      ? [
          {
            value: DENIED,
            label: (
              <span className="flex items-center gap-1.5 text-danger">
                <BanIcon />
                Denied
              </span>
            ),
            description:
              (!isDenied && denyLock) ||
              (DENY_REACHES_BUNDLES.has(scope.rowKey)
                ? "Overrides other roles, but not an access bundle that holds it"
                : "Overrides every other role"),
            isDisabled: Boolean(!isDenied && denyLock)
          }
        ]
      : [])
  ];
};

type Props = {
  policy: TAgentVaultPolicy;
  scope: TPermissionScope;
  // Names the scope in each control's label, such as "Sessions" or "github".
  scopeLabel: string;
  isReadOnly: boolean;
  onChange: (policy: TAgentVaultPolicy) => void;
  // The cells an action's name spans, up to the Access column, and whether a cell such as Remove follows that column.
  labelColSpan?: number;
  hasTrailingCell?: boolean;
  // Matches the width of the Access column's level Select, so the action selects line up under it.
  accessClassName?: string;
  // Lines the action names up under the name of the row above.
  indentClassName?: string;
};

/** A scope's actions, one row each with whether the role allows, denies or leaves it, under the row with its level. */
export const ActionRows = ({
  policy,
  scope,
  scopeLabel,
  isReadOnly,
  onChange,
  labelColSpan = 1,
  hasTrailingCell = false,
  accessClassName = "w-40",
  indentClassName = SUB_ROW_INDENT
}: Props) => {
  const actions = getPermissionRow(scope.rowKey).actions.filter((action) =>
    isActionListed(policy, scope, action)
  );
  const groups = [...new Set(actions.map((action) => action.group ?? ""))];
  const trailing = hasTrailingCell && <TableCell />;

  const setState = (key: string, next: string, isDenied: boolean) => {
    if (next === ALLOWED) onChange(setActionAllowed(policy, scope, key, true));
    else if (next === DENIED) onChange(setActionDenied(policy, scope, key, true));
    else if (isDenied) onChange(setActionDenied(policy, scope, key, false));
    else onChange(setActionAllowed(policy, scope, key, false));
  };

  return (
    <>
      {groups.map((group) => (
        <Fragment key={group || "actions"}>
          {groups.length > 1 && (
            <TableRow className={SUB_ROW}>
              <TableCell colSpan={labelColSpan + (hasTrailingCell ? 2 : 1)}>
                <span className={cn("block text-xs text-accent", indentClassName)}>{group}</span>
              </TableCell>
            </TableRow>
          )}
          {actions
            .filter((action) => (action.group ?? "") === group)
            .map((action) => {
              const state = getActionState(policy, scope, action.key);
              const name = group ? `${group} ${action.label}` : action.label;
              let value = NOT_ALLOWED;
              if (state.isDenied) value = DENIED;
              else if (state.isAllowed) value = ALLOWED;

              return (
                <TableRow key={action.key} className={SUB_ROW}>
                  <TableCell colSpan={labelColSpan} isWrappable className="max-w-0">
                    <div className={indentClassName}>
                      <div>{action.label}</div>
                      <p className="text-xs leading-4 text-muted">{action.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <LevelSelect
                      value={value}
                      options={optionsFor(scope, action, state)}
                      ariaLabel={`${name} on ${scopeLabel}`}
                      isDisabled={isReadOnly}
                      className={accessClassName}
                      onLevelChange={(next) => setState(action.key, next, state.isDenied)}
                    />
                  </TableCell>
                  {trailing}
                </TableRow>
              );
            })}
        </Fragment>
      ))}
    </>
  );
};
