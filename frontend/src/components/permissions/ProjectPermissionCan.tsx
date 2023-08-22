import { FunctionComponent, ReactNode } from "react";
import { BoundCanProps, Can } from "@casl/react";

import { TProjectPermission, useProjectPermission } from "@app/context/ProjectPermissionContext";

import { Tooltip } from "../v2";

type Props = {
  label?: ReactNode;
} & BoundCanProps<TProjectPermission>;

export const ProjectPermissionCan: FunctionComponent<Props> = ({
  label = "Permission Denied. Kindly contact your org admin",
  children,
  passThrough = true,
  ...props
}) => {
  const permission = useProjectPermission();

  return (
    <Can {...props} passThrough={passThrough} ability={props?.ability || permission}>
      {(isAllowed, ability) => {
        // akhilmhdh: This is set as type due to error in casl react type.
        const finalChild =
          typeof children === "function"
            ? children(isAllowed, ability as TProjectPermission)
            : children;

        if (!isAllowed && passThrough) {
          return <Tooltip content={label}>{finalChild}</Tooltip>;
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
