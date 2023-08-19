import { FunctionComponent, ReactNode } from "react";
import { BoundCanProps, Can } from "@casl/react";

import {
  OrgPermissionSubjects,
  OrgWorkspacePermissionActions,
  TOrgPermission,
  useOrgPermission
} from "@app/context/OrgPermissionContext";

import { Tooltip } from "../v2";

type Props = {
  label?: ReactNode;
} & BoundCanProps<TOrgPermission>;

export const OrgPermissionCan: FunctionComponent<Props> = ({
  label = "Permission Denied. Kindly contact your org admin",
  children,
  passThrough = true,
  ...props
}) => {
  const permission = useOrgPermission();

  return (
    <Can
      {...props}
      passThrough={passThrough}
      ability={props?.ability || permission}
      I={OrgWorkspacePermissionActions.Read}
      a={OrgPermissionSubjects.Sso}
    >
      {(isAllowed, ability) => {
        // akhilmhdh: This is set as type due to error in casl react type.
        const finalChild =
          typeof children === "function"
            ? children(isAllowed, ability as TOrgPermission)
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
