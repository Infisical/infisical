import { useForm } from "react-hook-form";
import { faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { Button, Table, TableContainer, TBody } from "@app/components/v2";
import { useNamespace } from "@app/context";
import { namespaceRolesQueryKeys, useUpdateNamespaceRole } from "@app/hooks/api/namespaceRoles";

import { NamespacePermissionAppConnectionRow } from "./NamespacePermissionAppConnectionRow";
import { NamespacePermissionAuditLogsRow } from "./NamespacePermissionAuditLogsRow";
// import { NamespaceGatewayPermissionRow } from "./NamespacePermissionGatewayRow";
import { NamespacePermissionGroupRow } from "./NamespacePermissionGroupRow";
import { NamespacePermissionIdentityRow } from "./NamespacePermissionIdentityRow";
import { NamespacePermissionMachineIdentityAuthTemplateRow } from "./NamespacePermissionMachineIdentityAuthTemplateRow";
import { NamespacePermissionMemberRow } from "./NamespacePermissionMemberRow";
import { NamespaceRoleNamespaceRow } from "./NamespacePermissionNamespaceRow";
import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "./NamespaceRoleModifySection.utils";
import { NamespaceRoleWorkspaceRow } from "./NamespaceRoleWorkspaceRow";
import { RolePermissionRow } from "./RolePermissionRow";

// TODO(namespace): add missing sort in type field
const SIMPLE_PERMISSION_OPTIONS = [
  {
    title: "Role Management",
    formName: "role"
  },
  {
    title: "Namespace Profile",
    formName: "settings"
  }
] as const;

type Props = {
  roleSlug: string;
};

export const RolePermissionsSection = ({ roleSlug }: Props) => {
  const { namespaceId } = useNamespace();

  const { data: role } = useQuery(
    namespaceRolesQueryKeys.detail({
      namespaceId,
      roleSlug
    })
  );

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

  const { mutateAsync: updateRole } = useUpdateNamespaceRole();

  const onSubmit = async (el: TFormSchema) => {
    try {
      await updateRole({
        ...el,
        namespaceId,
        roleId: role?.id || "",
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
        <div>
          <h3 className="text-lg font-semibold text-mineshaft-100">Policies</h3>
          <p className="text-sm leading-3 text-mineshaft-400">Configure granular access policies</p>
        </div>
        {isCustomRole && (
          <div className="flex items-center">
            {isDirty && (
              <Button
                className="mr-4 text-mineshaft-300"
                variant="link"
                isDisabled={isSubmitting || !isDirty}
                isLoading={isSubmitting}
                onClick={() => reset()}
              >
                Discard
              </Button>
            )}
            <Button
              colorSchema="secondary"
              type="submit"
              className="h-10 border"
              leftIcon={<FontAwesomeIcon icon={faSave} />}
              isDisabled={isSubmitting || !isDirty}
              isLoading={isSubmitting}
            >
              Save
            </Button>
          </div>
        )}
      </div>
      <div className="py-4">
        <TableContainer>
          <Table>
            <TBody>
              {SIMPLE_PERMISSION_OPTIONS.map((permission) => {
                return (
                  <RolePermissionRow
                    title={permission.title}
                    formName={permission.formName}
                    control={control}
                    setValue={setValue}
                    key={`org-role-${roleSlug}-permission-${permission.formName}`}
                    isEditable={isCustomRole}
                  />
                );
              })}
              <NamespacePermissionMemberRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespacePermissionAuditLogsRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespacePermissionIdentityRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespacePermissionGroupRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespacePermissionAppConnectionRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespaceRoleWorkspaceRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespacePermissionMachineIdentityAuthTemplateRow
                control={control}
                setValue={setValue}
                isEditable={isCustomRole}
              />
              <NamespaceRoleNamespaceRow
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
