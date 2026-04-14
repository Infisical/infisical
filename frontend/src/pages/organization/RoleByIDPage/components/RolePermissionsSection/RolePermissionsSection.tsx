import { useForm } from "react-hook-form";
import { faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { UnstableAccordion } from "@app/components/v3";
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
import { OrgPermissionAuditLogsRow } from "./OrgPermissionAuditLogsRow";
import { OrgPermissionBillingRow } from "./OrgPermissionBillingRow";
import { OrgPermissionEmailDomainRow } from "./OrgPermissionEmailDomainRow";
import { OrgGatewayPermissionRow } from "./OrgPermissionGatewayRow";
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

const SIMPLE_PERMISSION_OPTIONS = [
  {
    title: "User Management",
    formName: "member",
    description: "Manage organization member access and role assignments"
  },
  {
    title: "Role Management",
    formName: "role",
    description: "Define and configure custom organization-level permission roles"
  },
  {
    title: "Incident Contacts",
    formName: "incident-contact",
    description: "Manage contacts notified during security incidents"
  },
  {
    title: "Organization Profile",
    formName: "settings",
    description: "Configure organization-wide settings and preferences"
  },
  {
    title: "Secret Scanning",
    formName: "secret-scanning",
    description: "Configure automated scanning for leaked secrets"
  },
  {
    title: "LDAP",
    formName: "ldap",
    description: "Configure LDAP directory integration for authentication"
  },
  {
    title: "SCIM",
    formName: "scim",
    description: "Manage SCIM provisioning for automated user lifecycle management"
  },
  {
    title: "GitHub Organization Sync",
    formName: OrgPermissionSubjects.GithubOrgSync,
    description: "Sync GitHub organization teams with Infisical groups"
  },
  {
    title: "External KMS",
    formName: OrgPermissionSubjects.Kms,
    description: "Configure external key management systems for encryption"
  },
  {
    title: "Project Templates",
    formName: OrgPermissionSubjects.ProjectTemplates,
    description: "Manage reusable templates applied when creating new projects"
  }
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

  return (
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
      <div className="px-4 py-4">
        <UnstableAccordion type="multiple">
          {SIMPLE_PERMISSION_OPTIONS.filter((el) =>
            isRootOrganization
              ? true
              : !INVALID_SUBORG_PERMISSIONS.includes(el.formName as OrgPermissionSubjects)
          ).map((permission) => {
            return (
              <RolePermissionRow
                title={permission.title}
                formName={permission.formName}
                description={permission.description}
                control={control}
                setValue={setValue}
                key={`org-role-${roleId}-permission-${permission.formName}`}
                isEditable={isCustomRole}
              );
          })}
          {isRootOrganization && (
            <OrgPermissionSsoRow control={control} setValue={setValue} isEditable={isCustomRole} />
          )}
          <OrgPermissionAuditLogsRow
            control={control}
            setValue={setValue}
            isEditable={isCustomRole}
          />
          <OrgPermissionIdentityRow
            control={control}
            setValue={setValue}
            isEditable={isCustomRole}
          />
          <OrgPermissionGroupRow control={control} setValue={setValue} isEditable={isCustomRole} />
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
          <OrgRelayPermissionRow control={control} setValue={setValue} isEditable={isCustomRole} />
          {isRootOrganization && (
            <OrgPermissionBillingRow
              control={control}
              setValue={setValue}
              isEditable={isCustomRole}
            />
          )}
          <OrgPermissionSecretShareRow
            control={control}
            setValue={setValue}
            isEditable={isCustomRole}
          />
          <OrgRoleWorkspaceRow control={control} setValue={setValue} isEditable={isCustomRole} />
          <OrgPermissionAdminConsoleRow
            control={control}
            setValue={setValue}
            isEditable={isCustomRole}
          />
          <OrgPermissionMachineIdentityAuthTemplateRow
            control={control}
            setValue={setValue}
            isEditable={isCustomRole}
          />
          <OrgPermissionKmipRow control={control} setValue={setValue} isEditable={isCustomRole} />
          {isRootOrganization && (
            <OrgPermissionSubOrgRow
              control={control}
              setValue={setValue}
              isEditable={isCustomRole}
            />
          )}
        </UnstableAccordion>
      </div>
    </form>
  );
};
