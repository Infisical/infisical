import { OrgPermissionCan } from "./OrgPermissionCan";
import { ProjectPermissionCan } from "./ProjectPermissionCan";

interface PermissionCanProps {
  type: "project" | "org";
  I: any;
  a: any;
  children: (isAllowed: boolean, ability?: any) => React.ReactNode;
}

export const VariablePermissionCan = ({ type, children, ...props }: PermissionCanProps) => {
  if (type === "project") {
    return <ProjectPermissionCan {...props}>{children}</ProjectPermissionCan>;
  }

  return <OrgPermissionCan {...props}>{children}</OrgPermissionCan>;
};
