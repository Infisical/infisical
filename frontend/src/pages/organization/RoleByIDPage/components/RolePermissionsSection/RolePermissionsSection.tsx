import { FormProvider, useForm, useWatch } from "react-hook-form";
import { faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import {
  UnstableAccordion,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import { OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetOrgRole, useUpdateOrgRole } from "@app/hooks/api";
import { OrgPermissionAppConnectionRow } from "@app/pages/organization/RoleByIDPage/components/RolePermissionsSection/OrgPermissionAppConnectionRow";

import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "../OrgRoleModifySection.utils";
import { OrgAddPoliciesButton } from "./OrgAddPoliciesButton";
import { OrgPermissionAdminConsoleRow } from "./OrgPermissionAdminConsoleRow";
import { OrgPermissionAuditLogsRow } from "./OrgPermissionAuditLogsRow";
import { OrgPermissionBillingRow } from "./OrgPermissionBillingRow";
import { OrgPermissionEmailDomainRow } from "./OrgPermissionEmailDomainRow";
import { OrgGatewayPermissionRow } from "./OrgPermissionGatewayRow";
import { OrgPermissionGithubOrgSyncManualRow } from "./OrgPermissionGithubOrgSyncManualRow";
import { OrgPermissionGroupRow } from "./OrgPermissionGroupRow";
import { OrgPermissionIdentityRow } from "./OrgPermissionIdentityRow";
import { OrgPermissionKmipRow } from "./OrgPermissionKmipRow";
import { OrgPermissionMachineIdentityAuthTemplateRow } from "./OrgPermissionMachineIdentityAuthTemplateRow";
import { OrgRelayPermissionRow } from "./OrgPermissionRelayRow";
import { OrgPermissionSecretShareRow } from "./OrgPermissionSecretShareRow";
import { OrgPermissionSsoRow } from "./OrgPermissionSsoRow";
import { OrgPermissionSubOrgRow } from "./OrgPermissionSubOrgRow";
import { OrgRoleWorkspaceRow } from "./OrgRoleWorkspaceRow";
import { RolePermissionRow } from "./RolePermissionRow";

const SIMPLE_PERMISSION_SUBJECTS = [
  OrgPermissionSubjects.Member,
  OrgPermissionSubjects.Role,
  OrgPermissionSubjects.IncidentAccount,
  OrgPermissionSubjects.Settings,
  OrgPermissionSubjects.SecretScanning,
  OrgPermissionSubjects.Ldap,
  OrgPermissionSubjects.Scim,
  OrgPermissionSubjects.GithubOrgSync,
  OrgPermissionSubjects.Kms,
  OrgPermissionSubjects.ProjectTemplates
] as const;

type Props = {
  roleId: string;
};

const INVALID_SUBORG_PERMISSIONS = [
  OrgPermissionSubjects.Sso,
  OrgPermissionSubjects.Ldap,
  OrgPermissionSubjects.Scim,
  OrgPermissionSubjects.GithubOrgSync,
  OrgPermissionSubjects.GithubOrgSyncManual,
  OrgPermissionSubjects.Billing,
  OrgPermissionSubjects.SubOrganization
];

export const RolePermissionsSection = ({ roleId }: Props) => {
  const { currentOrg, isRootOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: role } = useGetOrgRole(orgId, roleId);

  const form = useForm<TFormSchema>({
    defaultValues: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : {},
    resolver: zodResolver(formSchema)
  });

  const {
    setValue,
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = form;

  const { mutateAsync: updateRole } = useUpdateOrgRole();

  const onSubmit = async (el: TFormSchema) => {
    await updateRole({
      orgId,
      id: roleId,
      ...el,
      permissions: formRolePermission2API(el.permissions)
    });
    reset(el);
    createNotification({ type: "success", text: "Successfully updated role" });
  };

  const isCustomRole = !["admin", "member", "no-access"].includes(role?.slug ?? "");

  const permissions = useWatch({ control, name: "permissions" });

  const hasPermissions = Object.values(permissions || {}).some((v) => v !== undefined);

  const invalidSubjectsForAddPolicy = isRootOrganization ? [] : INVALID_SUBORG_PERMISSIONS;

  const handleDeletePermission = (subject: OrgPermissionSubjects) => {
    setValue(`permissions.${subject}` as never, undefined as never, { shouldDirty: true });
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full w-full flex-1 flex-col rounded-lg border border-border bg-card py-4"
      >
        <div className="mx-4 flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-lg font-medium text-foreground">Policies</h3>
            <p className="text-sm leading-3 text-muted">Configure granular access policies</p>
          </div>
          {isCustomRole && (
            <div className="flex items-center gap-2">
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
              <div className="ml-2 border-l border-border pl-4">
                <OrgAddPoliciesButton
                  isDisabled={!isCustomRole}
                  invalidSubjects={invalidSubjectsForAddPolicy}
                />
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-4">
          {!hasPermissions && (
            <UnstableEmpty className="border py-8">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>No policies applied</UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  Add policies to configure permissions for this role.
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
            </UnstableEmpty>
          )}
          {hasPermissions && (
            <UnstableAccordion type="multiple">
              {SIMPLE_PERMISSION_SUBJECTS.filter((subject) =>
                isRootOrganization ? true : !INVALID_SUBORG_PERMISSIONS.includes(subject)
              )
                .filter((subject) => permissions?.[subject] !== undefined)
                .map((subject) => (
                  <RolePermissionRow
                    formName={subject}
                    control={control}
                    setValue={setValue}
                    key={`org-role-${roleId}-permission-${subject}`}
                    isEditable={isCustomRole}
                    onDelete={isCustomRole ? () => handleDeletePermission(subject) : undefined}
                  />
                ))}
              {isRootOrganization &&
                permissions?.[OrgPermissionSubjects.GithubOrgSyncManual] !== undefined && (
                  <OrgPermissionGithubOrgSyncManualRow
                    control={control}
                    setValue={setValue}
                    isEditable={isCustomRole}
                    onDelete={
                      isCustomRole
                        ? () => handleDeletePermission(OrgPermissionSubjects.GithubOrgSyncManual)
                        : undefined
                    }
                  />
                )}
              {isRootOrganization && permissions?.[OrgPermissionSubjects.Sso] !== undefined && (
                <OrgPermissionSsoRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Sso)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.AuditLogs] !== undefined && (
                <OrgPermissionAuditLogsRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.AuditLogs)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.Identity] !== undefined && (
                <OrgPermissionIdentityRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Identity)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.Groups] !== undefined && (
                <OrgPermissionGroupRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Groups)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.AppConnections] !== undefined && (
                <OrgPermissionAppConnectionRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.AppConnections)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.Gateway] !== undefined && (
                <OrgGatewayPermissionRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Gateway)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.Relay] !== undefined && (
                <OrgRelayPermissionRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Relay)
                      : undefined
                  }
                />
              )}
              {isRootOrganization && permissions?.[OrgPermissionSubjects.Billing] !== undefined && (
                <OrgPermissionBillingRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Billing)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.EmailDomains] !== undefined && (
                <OrgPermissionEmailDomainRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.EmailDomains)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.SecretShare] !== undefined && (
                <OrgPermissionSecretShareRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.SecretShare)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.Project] !== undefined && (
                <OrgRoleWorkspaceRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Project)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.AdminConsole] !== undefined && (
                <OrgPermissionAdminConsoleRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.AdminConsole)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.MachineIdentityAuthTemplate] !== undefined && (
                <OrgPermissionMachineIdentityAuthTemplateRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () =>
                          handleDeletePermission(OrgPermissionSubjects.MachineIdentityAuthTemplate)
                      : undefined
                  }
                />
              )}
              {permissions?.[OrgPermissionSubjects.Kmip] !== undefined && (
                <OrgPermissionKmipRow
                  control={control}
                  setValue={setValue}
                  isEditable={isCustomRole}
                  onDelete={
                    isCustomRole
                      ? () => handleDeletePermission(OrgPermissionSubjects.Kmip)
                      : undefined
                  }
                />
              )}
              {isRootOrganization &&
                permissions?.[OrgPermissionSubjects.SubOrganization] !== undefined && (
                  <OrgPermissionSubOrgRow
                    control={control}
                    setValue={setValue}
                    isEditable={isCustomRole}
                    onDelete={
                      isCustomRole
                        ? () => handleDeletePermission(OrgPermissionSubjects.SubOrganization)
                        : undefined
                    }
                  />
                )}
            </UnstableAccordion>
          )}
        </div>
      </form>
    </FormProvider>
  );
};
