import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SaveIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@app/components/v3";
import { OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetOrgRole, useUpdateOrgRole } from "@app/hooks/api";
import {
  GeneralPermissionPolicies,
  PermissionScope
} from "@app/pages/project/RoleDetailsBySlugPage/components/GeneralPermissionPolicies";

import {
  formRolePermission2API,
  formSchema,
  ORG_PERMISSION_OBJECT,
  rolePermission2Form,
  TFormSchema
} from "../OrgRoleModifySection.utils";
import { OrgAddPoliciesButton } from "./OrgAddPoliciesButton";

const INVALID_SUBORG_PERMISSIONS = [
  OrgPermissionSubjects.Sso,
  OrgPermissionSubjects.Ldap,
  OrgPermissionSubjects.Scim,
  OrgPermissionSubjects.GithubOrgSync,
  OrgPermissionSubjects.GithubOrgSyncManual,
  OrgPermissionSubjects.Billing,
  OrgPermissionSubjects.SubOrganization
];

type Props = {
  roleId: string;
};

export const RolePermissionsSection = ({ roleId }: Props) => {
  const { currentOrg, isRootOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: role } = useGetOrgRole(orgId, roleId);

  const form = useForm<TFormSchema>({
    defaultValues: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : {},
    resolver: zodResolver(formSchema)
  });

  const {
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = form;

  const [openPolicies, setOpenPolicies] = useState<string[]>([]);

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

  const handleFormSubmit = handleSubmit(onSubmit, (formErrors) => {
    if (formErrors.permissions) {
      const subjectsWithErrors = Object.keys(formErrors.permissions) as OrgPermissionSubjects[];
      setOpenPolicies((prev) => {
        const next = new Set(prev);
        subjectsWithErrors.forEach((subject) => next.add(subject));
        return Array.from(next);
      });
    }
  });

  const isCustomRole = !["admin", "member", "no-access"].includes(role?.slug ?? "");

  const permissions = useWatch({ control: form.control, name: "permissions" });

  const hasPermissions = Object.values(permissions || {}).some(
    (v) => Array.isArray(v) && v.length > 0
  );

  const invalidSubjectsForAddPolicy = isRootOrganization ? [] : INVALID_SUBORG_PERMISSIONS;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleFormSubmit}
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
                  type="button"
                  className="mr-4 text-muted"
                  variant="ghost"
                  disabled={isSubmitting || !isDirty}
                  onClick={() => reset()}
                >
                  Discard
                </Button>
              )}
              <Button variant="org" type="submit" disabled={isSubmitting || !isDirty}>
                <SaveIcon className="size-4" />
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
            <Empty className="border py-8">
              <EmptyHeader>
                <EmptyTitle>No policies applied</EmptyTitle>
                <EmptyDescription>
                  Add policies to configure permissions for this role.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {hasPermissions && (
            <Accordion type="multiple" value={openPolicies} onValueChange={setOpenPolicies}>
              {Object.entries(ORG_PERMISSION_OBJECT)
                .filter(
                  ([subject]) =>
                    isRootOrganization ||
                    !INVALID_SUBORG_PERMISSIONS.includes(subject as OrgPermissionSubjects)
                )
                .filter(
                  ([subject]) =>
                    (permissions?.[subject as keyof typeof permissions] as unknown[])?.length > 0
                )
                .map(([subject, config]) => (
                  <GeneralPermissionPolicies
                    key={`org-role-${roleId}-permission-${subject}`}
                    subject={subject as OrgPermissionSubjects}
                    subjectScope={PermissionScope.Organization}
                    title={config.title}
                    description={config.description}
                    actions={config.actions}
                    isDisabled={!isCustomRole}
                    isConditional={false}
                    isOpen={openPolicies.includes(subject)}
                    onRemoveLastRule={
                      isCustomRole
                        ? () => {
                            const current = form.getValues("permissions") ?? {};
                            form.setValue(
                              "permissions",
                              { ...current, [subject]: undefined } as NonNullable<
                                TFormSchema["permissions"]
                              >,
                              { shouldDirty: true }
                            );
                          }
                        : undefined
                    }
                  />
                ))}
            </Accordion>
          )}
        </div>
      </form>
    </FormProvider>
  );
};
