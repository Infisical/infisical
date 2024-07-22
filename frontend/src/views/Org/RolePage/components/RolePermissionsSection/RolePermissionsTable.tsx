import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Table, TableContainer, TBody, Th, THead, Tr } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgRole, useUpdateOrgRole } from "@app/hooks/api";
import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "@app/views/Org/MembersPage/components/OrgRoleTabSection/OrgRoleModifySection/OrgRoleModifySection.utils";

import { RolePermissionRow } from "./RolePermissionRow";

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

export const RolePermissionsTable = ({ roleId }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: role } = useGetOrgRole(orgId, roleId);

  const { setValue, control, handleSubmit } = useForm<TFormSchema>({
    defaultValues: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : {},
    resolver: zodResolver(formSchema)
  });

  const { mutateAsync: updateRole } = useUpdateOrgRole();

  const onSubmit = async (el: TFormSchema) => {
    try {
      await updateRole({
        orgId,
        id: roleId,
        ...el,
        permissions: formRolePermission2API(el.permissions)
      });
      createNotification({ type: "success", text: "Successfully updated role" });
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update role" });
    }
  };

  const isCustomRole = !["admin", "member", "no-access"].includes(role?.slug ?? "");

  return (
    <TableContainer>
      <form onSubmit={handleSubmit(onSubmit)}>
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
                <RolePermissionRow
                  title={permission.title}
                  formName={permission.formName}
                  control={control}
                  setValue={setValue}
                  handleSubmit={handleSubmit(onSubmit)}
                  key={`org-role-${roleId}-permission-${permission.formName}`}
                  isEditable={isCustomRole}
                />
              );
            })}
          </TBody>
        </Table>
      </form>
    </TableContainer>
  );
};
