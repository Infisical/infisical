import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, Table, TableContainer, TBody, Th, THead, Tr } from "@app/components/v2";
import { OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetOrgRole, useUpdateOrgRole } from "@app/hooks/api";
import { OrgPermissionAppConnectionRow } from "@app/pages/organization/RoleByIDPage/components/RolePermissionsSection/OrgPermissionAppConnectionRow";

import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "../OrgRoleModifySection.utils";
import { OrgPermissionAdminConsoleRow } from "./OrgPermissionAdminConsoleRow";
import { OrgPermissionBillingRow } from "./OrgPermissionBillingRow";
import { OrgGatewayPermissionRow } from "./OrgPermissionGatewayRow";
import { OrgPermissionGroupRow } from "./OrgPermissionGroupRow";
import { OrgPermissionIdentityRow } from "./OrgPermissionIdentityRow";
import { OrgPermissionKmipRow } from "./OrgPermissionKmipRow";
import { OrgPermissionSecretShareRow } from "./OrgPermissionSecretShareRow";
import { OrgRoleWorkspaceRow } from "./OrgRoleWorkspaceRow";
import { RolePermissionRow } from "./RolePermissionRow";

const SIMPLE_PERMISSION_OPTIONS = [
  {
    title: "User Management",
    formName: "member"
  },
  {
    title: "Role Management",
    formName: "role"
  },
  {
    title: "Incident Contacts",
    formName: "incident-contact"
  },
  {
    title: "Audit Logs",
    formName: "audit-logs"
  },
  {
    title: "Organization Profile",
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
  },
  {
    title: "GitHub Organization Sync",
    formName: OrgPermissionSubjects.GithubOrgSync
  },
  {
    title: "External KMS",
    formName: OrgPermissionSubjects.Kms
  },
  { title: "Project Templates", formName: OrgPermissionSubjects.ProjectTemplates }
] as const;

type Props = {
  roleId: string;
};

export const RolePermissionsSection = ({ roleId }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: role } = useGetOrgRole(orgId, roleId);

  const {
    setValue,
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = useForm<TFormSchema>({
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
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Permissions</h3>
        {isCustomRole && (
          <div className="flex items-center">
            <Button
              colorSchema="primary"
              type="submit"
              isDisabled={isSubmitting || !isDirty}
              isLoading={isSubmitting}
            >
              Save
            </Button>
            <Button
              className="ml-4 text-mineshaft-300"
              variant="link"
              isDisabled={isSubmitting || !isDirty}
              isLoading={isSubmitting}
              onClick={() => reset()}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div className="py-4">
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
                  <RolePermissionRow
                    title={permission.title}
                    formName={permission.formName}
                    control={control}
                    setValue={setValue}
                    key={`org-role-${roleId}-permission-${permission.formName}`}
                    isEditable={isCustomRole}
                  />
                );
              })}
              <OrgPermissionIdentityRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgPermissionGroupRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgPermissionAppConnectionRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgGatewayPermissionRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgPermissionBillingRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgPermissionSecretShareRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgRoleWorkspaceRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgPermissionAdminConsoleRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <OrgPermissionKmipRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
            </TBody>
          </Table>
        </TableContainer>
      </div>
    </form>
  );
};
