import { ReactElement } from "react";
import { faCheckCircle, faCircleMinus, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { NodeToolbar, Position } from "@xyflow/react";

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
      <span className="font-medium capitalize text-mineshaft-100">{camelCaseToSpaces(key)}</span>{" "}
      <span className="text-mineshaft-200">
        {formatedConditionsOperatorNames[operator as PermissionConditionOperators]}
      </span>{" "}
      <span className="rounded bg-mineshaft-600 p-0.5 font-mono">
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
          <div className="flex items-center gap-1.5 capitalize text-green">
            <FontAwesomeIcon icon={faCheckCircle} size="xs" />
            <span>Full {formatActionName(action)} Permissions</span>
          </div>
          <p className="text-mineshaft-200">
            Policy grants unconditional{" "}
            <span className="font-medium text-mineshaft-100">
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
          <div className="flex items-center gap-1.5 capitalize text-yellow">
            <FontAwesomeIcon icon={faCircleMinus} className="text-yellow" size="xs" />
            <span>Conditional {formatActionName(action)} Permissions</span>
          </div>
          <p className="mb-1 text-mineshaft-200">
            Policy conditionally allows{" "}
            <span className="font-medium text-mineshaft-100">
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
          <div className="flex items-center gap-1.5 capitalize text-red">
            <FontAwesomeIcon icon={faCircleXmark} size="xs" />
            <span>No {formatActionName(action)} Permissions</span>
          </div>
          <p className="text-mineshaft-200">
            Policy always forbids{" "}
            <span className="font-medium text-mineshaft-100">
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
      className="rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-sm font-light text-bunker-100"
      isVisible
      position={Position.Bottom}
    >
      {component}
    </NodeToolbar>
  );
};
