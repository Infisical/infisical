import { ReactElement } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { CircleCheckIcon, CircleMinusIcon, CircleXIcon } from "lucide-react";

import {
  formatedConditionsOperatorNames,
  PermissionConditionOperators
} from "@app/context/ProjectPermissionContext/types";
import { camelCaseToSpaces } from "@app/lib/fn/string";

import { PermissionAccess } from "../../../types";
import { createFolderNode, formatActionName } from "../../../utils";

type Props = {
  action: string;
  access: PermissionAccess;
} & Pick<ReturnType<typeof createFolderNode>["data"], "actionRuleMap" | "subject">;

type ConditionDisplayProps = {
  _key: string;
  operator: string;
  value: string | string[];
};

const ConditionDisplay = ({ _key: key, value, operator }: ConditionDisplayProps) => {
  return (
    <li>
      <span className="font-medium text-foreground capitalize">{camelCaseToSpaces(key)}</span>{" "}
      <span className="text-accent">
        {formatedConditionsOperatorNames[operator as PermissionConditionOperators]}
      </span>{" "}
      <span className="rounded-sm bg-container px-1 py-0.5 font-mono text-foreground">
        {typeof value === "string" ? value : value.join(", ")}
      </span>
      .
    </li>
  );
};

export const FolderNodeTooltipContent = ({ action, access, actionRuleMap, subject }: Props) => {
  let component: ReactElement;

  switch (access) {
    case PermissionAccess.Full:
      component = (
        <>
          <div className="flex items-center gap-1.5 text-success capitalize">
            <CircleCheckIcon className="size-3.5" />
            <span>Full {formatActionName(action)} Permissions</span>
          </div>
          <p className="text-accent">
            Policy grants unconditional{" "}
            <span className="font-medium text-foreground">
              {formatActionName(action).toLowerCase()}
            </span>{" "}
            permission for {subject.replaceAll("-", " ")} in this folder.
          </p>
        </>
      );
      break;
    case PermissionAccess.Partial:
      component = (
        <>
          <div className="flex items-center gap-1.5 text-warning capitalize">
            <CircleMinusIcon className="size-3.5" />
            <span>Conditional {formatActionName(action)} Permissions</span>
          </div>
          <p className="mb-1 text-accent">
            Policy conditionally allows{" "}
            <span className="font-medium text-foreground">
              {formatActionName(action).toLowerCase()}
            </span>{" "}
            permission for {subject.replaceAll("-", " ")} in this folder.
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-4">
            {actionRuleMap.map((ruleMap, index) => {
              const rule = ruleMap[action];

              if (!rule || !rule.conditions) return null;

              if (
                rule.conditions.secretName ||
                rule.conditions.secretTags ||
                rule.conditions.metadata
              ) {
                return (
                  <li key={`${action}_${index + 1}`}>
                    <span className="italic">{rule.inverted ? "Forbids" : "Allows"}</span>
                    <span> when:</span>
                    {Object.entries(rule.conditions).map(([key, condition]) => {
                      if (key.match(/secretPath|environment/)) {
                        return null;
                      }

                      return (
                        <ul key={`${action}_${index + 1}_${key}`} className="list-[square] pl-4">
                          {Object.entries(condition as object).map(([operator, value]) => {
                            if (operator === "$elemMatch") {
                              return Object.entries(value as object).map(
                                ([nestedKey, nestedCondition]) =>
                                  Object.entries(nestedCondition as object).map(
                                    ([nestedOperator, nestedValue]) => (
                                      <ConditionDisplay
                                        _key={`${key} ${nestedKey}`}
                                        operator={nestedOperator}
                                        value={nestedValue}
                                        key={`${action}_${index + 1}_${key}_${operator}_${nestedKey}_${nestedOperator}`}
                                      />
                                    )
                                  )
                              );
                            }

                            return (
                              <ConditionDisplay
                                _key={key}
                                operator={operator}
                                value={value}
                                key={`${action}_${index + 1}_${key}_${operator}`}
                              />
                            );
                          })}
                        </ul>
                      );
                    })}
                  </li>
                );
              }

              return null;
            })}
          </ul>
        </>
      );
      break;
    case PermissionAccess.None:
      component = (
        <>
          <div className="flex items-center gap-1.5 text-danger capitalize">
            <CircleXIcon className="size-3.5" />
            <span>No {formatActionName(action)} Permissions</span>
          </div>
          <p className="text-accent">
            Policy always forbids{" "}
            <span className="font-medium text-foreground">
              {formatActionName(action).toLowerCase()}
            </span>{" "}
            permission for {subject.replaceAll("-", " ")} in this folder.
          </p>
        </>
      );
      break;
    default:
      throw new Error(`Unhandled access type: ${access}`);
  }

  return (
    <NodeToolbar
      className="max-w-sm rounded-md border border-border bg-popover px-4 py-2 text-sm text-foreground shadow-lg"
      isVisible
      position={Position.Bottom}
    >
      {component}
    </NodeToolbar>
  );
};
