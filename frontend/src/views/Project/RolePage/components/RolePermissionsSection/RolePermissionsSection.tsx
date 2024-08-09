import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, Table, TableContainer, TBody, Th, THead, Tr } from "@app/components/v2";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { useGetProjectRoleBySlug, useUpdateProjectRole } from "@app/hooks/api";
import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "@app/views/Project/RolePage/components/RolePermissionsSection/ProjectRoleModifySection.utils";

import { RolePermissionRow } from "./RolePermissionRow";
import { RowPermissionSecretFoldersRow } from "./RolePermissionSecretFoldersRow";
import { RowPermissionSecretsRow } from "./RolePermissionSecretsRow";

const SINGLE_PERMISSION_LIST = [
  {
    title: "Project",
    formName: "workspace"
  },
  {
    title: "Integrations",
    formName: "integrations"
  },
  {
    title: "Secret Protect policy",
    formName: ProjectPermissionSub.SecretApproval
  },
  {
    title: "Roles",
    formName: "role"
  },
  {
    title: "User Management",
    formName: "member"
  },
  {
    title: "Group Management",
    formName: "groups"
  },
  {
    title: "Machine Identity Management",
    formName: "identity"
  },
  {
    title: "Webhooks",
    formName: "webhooks"
  },
  {
    title: "Service Tokens",
    formName: "service-tokens"
  },
  {
    title: "Settings",
    formName: "settings"
  },
  {
    title: "Environments",
    formName: "environments"
  },
  {
    title: "Tags",
    formName: "tags"
  },
  {
    title: "Audit Logs",
    formName: "audit-logs"
  },
  {
    title: "IP Allowlist",
    formName: "ip-allowlist"
  },
  {
    title: "Certificate Authorities",
    formName: "certificate-authorities"
  },
  {
    title: "Certificates",
    formName: "certificates"
  },
  {
    title: "PKI Collections",
    formName: "pki-collections"
  },
  {
    title: "PKI Alerts",
    formName: "pki-alerts"
  },
  {
    title: "Secret Rollback",
    formName: "secret-rollback"
  }
] as const;

type Props = {
  roleSlug: string;
};

export const RolePermissionsSection = ({ roleSlug }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectSlug = currentWorkspace?.slug || "";
  const { data: role } = useGetProjectRoleBySlug(currentWorkspace?.slug ?? "", roleSlug as string);

  const {
    setValue,
    getValues,
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = useForm<TFormSchema>({
    defaultValues: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : {},
    resolver: zodResolver(formSchema)
  });

  const { mutateAsync: updateRole } = useUpdateProjectRole();

  const onSubmit = async (el: TFormSchema) => {
    try {
      if (!projectSlug || !role?.id) return;

      await updateRole({
        id: role?.id as string,
        projectSlug,
        ...el,
        permissions: formRolePermission2API(el.permissions)
      });

      createNotification({ type: "success", text: "Successfully updated role" });
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update role" });
    }
  };

  const isCustomRole = !["admin", "member", "viewer", "no-access"].includes(role?.slug ?? "");

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
              <RowPermissionSecretsRow
                title="Secrets"
                formName={ProjectPermissionSub.Secrets}
                isEditable={isCustomRole}
                setValue={setValue}
                getValue={getValues}
                control={control}
              />
              <RowPermissionSecretFoldersRow
                isEditable={isCustomRole}
                setValue={setValue}
                control={control}
              />
              {SINGLE_PERMISSION_LIST.map((permission) => {
                return (
                  <RolePermissionRow
                    title={permission.title}
                    formName={permission.formName}
                    control={control}
                    setValue={setValue}
                    key={`project-role-${roleSlug}-permission-${permission.formName}`}
                    isEditable={isCustomRole}
                  />
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      </div>
    </form>
  );
};
