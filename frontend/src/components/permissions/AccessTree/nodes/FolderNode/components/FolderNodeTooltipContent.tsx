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

              if (
                !rule ||
                !rule.conditions ||
                (!rule.conditions.secretName && !rule.conditions.secretTags)
              )
                return null;

              return (
                <li key={`${action}_${index + 1}`}>
                  <span className={`italic ${rule.inverted ? "text-red" : "text-green"} `}>
                    {rule.inverted ? "Forbids" : "Allows"}
                  </span>
                  <span> when:</span>
                  {Object.entries(rule.conditions).map(([key, condition]) => (
                    <ul key={`${action}_${index + 1}_${key}`} className="list-[square] pl-4">
                      {Object.entries(condition as object).map(([operator, value]) => (
                        <li key={`${action}_${index + 1}_${key}_${operator}`}>
                          <span className="font-medium capitalize text-mineshaft-100">
                            {camelCaseToSpaces(key)}
                          </span>{" "}
                          <span className="text-mineshaft-200">
                            {
                              formatedConditionsOperatorNames[
                                operator as PermissionConditionOperators
                              ]
                            }
                          </span>{" "}
                          <span className={rule.inverted ? "text-red" : "text-green"}>
                            {typeof value === "string" ? value : value.join(", ")}
                          </span>
                          .
                        </li>
                      ))}
                    </ul>
                  ))}
                </li>
              );
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
