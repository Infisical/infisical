import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Table, TableContainer, TBody, Th, THead, Tr } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgRole } from "@app/hooks/api";
// TODO: consider moving this out
import {
  formSchema,
  rolePermission2Form,
  TFormSchema} from "@app/views/Org/MembersPage/components/OrgRoleTabSection/OrgRoleModifySection/OrgRoleModifySection.utils";

import { RolePermissionRow2 } from "./RolePermissionRow2";

const SIMPLE_PERMISSION_OPTIONS = [
  {
    title: "User management",
    formName: "member"
  },
  {
    title: "Group management",
    formName: "groups"
  },
  {
    title: "Machine identity management",
    formName: "identity"
  },
  {
    title: "Billing & usage",
    formName: "billing"
  },
  {
    title: "Role management",
    formName: "role"
  },
  {
    title: "Incident Contacts",
    formName: "incident-contact"
  },
  {
    title: "Organization profile",
    formName: "settings"
  },
  {
    title: "Secret Scanning",
    formName: "secret-scanning"
  },
  {
    title: "SSO",
    formName: "sso"
  },
  {
    title: "LDAP",
    formName: "ldap"
  },
  {
    title: "SCIM",
    formName: "scim"
  }
] as const;

type Props = {
  roleId: string;
};

export const RolePermissionsTable2 = ({ roleId }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: role } = useGetOrgRole(orgId, roleId);

  const { setValue, control } = useForm<TFormSchema>({
    defaultValues: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : {},
    resolver: zodResolver(formSchema)
  });

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th className="w-5" />
            <Th>Resource</Th>
            <Th>Permission</Th>
          </Tr>
        </THead>
        <TBody>
          {SIMPLE_PERMISSION_OPTIONS.map((permission) => {
            return (
              <RolePermissionRow2
                title={permission.title}
                formName={permission.formName}
                control={control}
                setValue={setValue}
                key={`org-role-${roleId}-permission-${permission.formName}`}
              />
            );
          })}
        </TBody>
      </Table>
    </TableContainer>
  );
};
