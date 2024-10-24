import { FunctionComponent, ReactNode } from "react";
import { AbilityTuple, MongoAbility } from "@casl/ability";
import { Can } from "@casl/react";

import { ProjectPermissionSet, useProjectPermission } from "@app/context/ProjectPermissionContext";

import { Tooltip } from "../v2/Tooltip";

type Props<T extends AbilityTuple> = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused  to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  children: ReactNode | ((isAllowed: boolean, ability: T) => ReactNode);
  passThrough?: boolean;
  I: T[0];
  a: T[1];
  ability?: MongoAbility<T>;
};

export const ProjectPermissionCan: FunctionComponent<Props<ProjectPermissionSet>> = ({
  label = "Access restricted",
  children,
  passThrough = true,
  renderTooltip,
  allowedLabel,
  ...props
}) => {
  const { permission } = useProjectPermission();
  return (
    <Can {...props} passThrough={passThrough} ability={props?.ability || permission}>
      {(isAllowed, ability) => {
        // akhilmhdh: This is set as type due to error in casl react type.
        const finalChild =
          typeof children === "function" ? children(isAllowed, ability as any) : children;

        if (!isAllowed && passThrough) {
          return <Tooltip content={label}>{finalChild}</Tooltip>;
        }

        if (isAllowed && renderTooltip) {
          return <Tooltip content={allowedLabel}>{finalChild}</Tooltip>;
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
