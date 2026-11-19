import { Fragment } from "react";

import {
  Checkbox,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import {
  getActionState,
  getPermissionRow,
  setActionAllowed,
  setActionDenied,
  TAgentVaultPolicy,
  TPermissionScope
} from "./agentVaultPolicyModel";

type TBoxProps = {
  label: string;
  variant: "av" | "danger";
  isChecked: boolean;
  isDisabled: boolean;
  lock?: string;
  onChange: (isChecked: boolean) => void;
};

const ActionBox = ({ label, variant, isChecked, isDisabled, lock, onChange }: TBoxProps) => {
  const box = (
    <Checkbox
      variant={variant}
      aria-label={label}
      isChecked={isChecked}
      isDisabled={isDisabled || Boolean(lock)}
      onCheckedChange={(checked) => onChange(checked === true)}
    />
  );
  if (!lock) return box;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{box}</span>
      </TooltipTrigger>
      <TooltipContent>{lock}</TooltipContent>
    </Tooltip>
  );
};

// Sub-rows sit on a tint with an accent edge, so they read as belonging to the row above them.
const SUB_ROW = "bg-foreground/[0.02] hover:bg-foreground/[0.04]";
const SUB_ROW_EDGE = "border-l-2 border-l-product-av/40";
// Indents a sub-row's label under the row above it, inside the cell's own padding.
const SUB_ROW_INDENT = "pl-7";
const SUB_ROW_HEADING = `block text-xs text-accent ${SUB_ROW_INDENT}`;

type Props = {
  policy: TAgentVaultPolicy;
  scope: TPermissionScope;
  // Names the scope in each box's label, such as "Sessions" or "github".
  scopeLabel: string;
  isReadOnly: boolean;
  onChange: (policy: TAgentVaultPolicy) => void;
  // The cells an action's name spans, up to the Access column, and whether a cell such as Remove follows that column.
  labelColSpan?: number;
  hasTrailingCell?: boolean;
  // Matches the width of the Access column's level Select, so Allow and Deny line up under it.
  accessClassName?: string;
};

/** A scope's actions as Allow and Deny rows, for the table row that holds the scope's level. */
export const ActionRows = ({
  policy,
  scope,
  scopeLabel,
  isReadOnly,
  onChange,
  labelColSpan = 1,
  hasTrailingCell = false,
  accessClassName = "w-40"
}: Props) => {
  const actions = getPermissionRow(scope.rowKey).actions.filter(
    (action) => !(scope.itemId && action.isAllOnly)
  );
  const groups = [...new Set(actions.map((action) => action.group ?? ""))];
  const trailing = hasTrailingCell && <TableCell />;

  return (
    <>
      <TableRow className={SUB_ROW}>
        <TableCell colSpan={labelColSpan} className={SUB_ROW_EDGE}>
          <span className={SUB_ROW_HEADING}>{groups[0] || "Action"}</span>
        </TableCell>
        <TableCell>
          <div className={cn("grid grid-cols-2 text-center text-xs text-accent", accessClassName)}>
            <span>Allow</span>
            <span>Deny</span>
          </div>
        </TableCell>
        {trailing}
      </TableRow>
      {groups.map((group, groupIndex) => (
        <Fragment key={group || "actions"}>
          {groupIndex > 0 && (
            <TableRow className={SUB_ROW}>
              <TableCell
                colSpan={labelColSpan + (hasTrailingCell ? 2 : 1)}
                className={SUB_ROW_EDGE}
              >
                <span className={SUB_ROW_HEADING}>{group}</span>
              </TableCell>
            </TableRow>
          )}
          {actions
            .filter((action) => (action.group ?? "") === group)
            .map((action) => {
              const state = getActionState(policy, scope, action.key);
              const name = group ? `${group} ${action.label}` : action.label;

              return (
                <TableRow key={action.key} className={SUB_ROW}>
                  <TableCell
                    colSpan={labelColSpan}
                    isWrappable
                    className={cn("max-w-0", SUB_ROW_EDGE)}
                  >
                    <div className={SUB_ROW_INDENT}>
                      <div>{action.label}</div>
                      <p className="text-xs leading-4 text-muted">{action.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={cn("grid grid-cols-2 justify-items-center", accessClassName)}>
                      <ActionBox
                        label={`Allow ${name} on ${scopeLabel}`}
                        variant="av"
                        isChecked={state.isAllowed}
                        isDisabled={isReadOnly}
                        lock={state.allowLock}
                        onChange={(isAllowed) =>
                          onChange(setActionAllowed(policy, scope, action.key, isAllowed))
                        }
                      />
                      <ActionBox
                        label={`Deny ${name} on ${scopeLabel}`}
                        variant="danger"
                        isChecked={state.isDenied}
                        isDisabled={isReadOnly}
                        lock={state.denyLock}
                        onChange={(isDenied) =>
                          onChange(setActionDenied(policy, scope, action.key, isDenied))
                        }
                      />
                    </div>
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
