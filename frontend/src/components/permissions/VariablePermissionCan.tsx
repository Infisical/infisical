import { NamespacePermissionCan } from "./NamespacePermissionCan";
import { OrgPermissionCan } from "./OrgPermissionCan";
import { ProjectPermissionCan } from "./ProjectPermissionCan";

interface PermissionCanProps {
  type: "project" | "org" | "namespace";
  I: any;
  a: any;
  children: (isAllowed: boolean, ability?: any) => React.ReactNode;
}

// TODO(namespace): think of a way to make this ts sense
export const VariablePermissionCan = ({ type, children, ...props }: PermissionCanProps) => {
  if (type === "project") {
    return <ProjectPermissionCan {...props}>{children}</ProjectPermissionCan>;
  }

  if (type === "namespace") {
    return <NamespacePermissionCan {...props}>{children}</NamespacePermissionCan>;
  }

  return <OrgPermissionCan {...props}>{children}</OrgPermissionCan>;
};
