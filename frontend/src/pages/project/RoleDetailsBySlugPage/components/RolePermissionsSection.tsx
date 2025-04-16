import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import { faPlus, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { AccessTree } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { evaluatePermissionsAbility } from "@app/helpers/permissions";
import { useGetProjectRoleBySlug, useUpdateProjectRole } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { DynamicSecretPermissionConditions } from "./DynamicSecretPermissionConditions";
import { GeneralPermissionConditions } from "./GeneralPermissionConditions";
import { GeneralPermissionPolicies } from "./GeneralPermissionPolicies";
import { IdentityManagementPermissionConditions } from "./IdentityManagementPermissionConditions";
import { PermissionEmptyState } from "./PermissionEmptyState";
import {
  formRolePermission2API,
  isConditionalSubjects,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  rolePermission2Form,
  TFormSchema
} from "./ProjectRoleModifySection.utils";
import { SecretPermissionConditions } from "./SecretPermissionConditions";
import { SshHostPermissionConditions } from "./SshHostPermissionConditions";

type Props = {
  roleSlug: string;
  isDisabled?: boolean;
};

export const renderConditionalComponents = (
  subject: ProjectPermissionSub,
  isDisabled?: boolean
) => {
  if (subject === ProjectPermissionSub.Secrets)
    return <SecretPermissionConditions isDisabled={isDisabled} />;

  if (subject === ProjectPermissionSub.DynamicSecrets)
    return <DynamicSecretPermissionConditions isDisabled={isDisabled} />;

  if (isConditionalSubjects(subject)) {
    if (subject === ProjectPermissionSub.Identity) {
      return <IdentityManagementPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.SshHosts) {
      return <SshHostPermissionConditions isDisabled={isDisabled} />;
    }

    return <GeneralPermissionConditions isDisabled={isDisabled} type={subject} />;
  }

  return undefined;
};

export const RolePermissionsSection = ({ roleSlug, isDisabled }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: role, isPending } = useGetProjectRoleBySlug(
    currentWorkspace?.id ?? "",
    roleSlug as string
  );

  const form = useForm<TFormSchema>({
    values: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : undefined,
    resolver: zodResolver(projectRoleFormSchema)
  });

  const {
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = form;

  const { mutateAsync: updateRole } = useUpdateProjectRole();

  const onSubmit = async (el: TFormSchema) => {
    try {
      if (!projectId || !role?.id) return;
      await updateRole({
        id: role?.id as string,
        projectId,
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

  const onNewPolicy = (selectedSubject: ProjectPermissionSub) => {
    const rootPolicyValue = form.getValues(`permissions.${selectedSubject}`);
    if (rootPolicyValue && isConditionalSubjects(selectedSubject)) {
      form.setValue(
        `permissions.${selectedSubject}`,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error akhilmhdh: this is because of ts collision with both
        [...rootPolicyValue, {}],
        { shouldDirty: true, shouldTouch: true }
      );
    } else {
      form.setValue(
        `permissions.${selectedSubject}`,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error akhilmhdh: this is because of ts collision with both
        [{}],
        {
          shouldDirty: true,
          shouldTouch: true
        }
      );
    }
  };

  const permissions = form.watch("permissions");

  const formattedPermissions = useMemo(
    () =>
      evaluatePermissionsAbility(
        formRolePermission2API(permissions) as RawRuleOf<
          MongoAbility<ProjectPermissionSet, MongoQuery>
        >[]
      ),
    [JSON.stringify(permissions)]
  );

  return (
    <div className="w-full">
      {currentWorkspace.type === ProjectType.SecretManager && (
        <AccessTree permissions={formattedPermissions} />
      )}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      >
        <FormProvider {...form}>
          <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
            <h3 className="text-lg font-semibold text-mineshaft-100">Policies</h3>
            <div className="flex items-center space-x-4">
              {isCustomRole && (
                <>
                  {isDirty && (
                    <Button
                      className="mr-4 text-mineshaft-300"
                      variant="link"
                      isDisabled={isSubmitting}
                      isLoading={isSubmitting}
                      onClick={() => reset()}
                    >
                      Discard
                    </Button>
                  )}
                  <div className="flex items-center">
                    <Button
                      variant="outline_bg"
                      type="submit"
                      className={twMerge("h-10 rounded-r-none", isDirty && "bg-primary text-black")}
                      isDisabled={isSubmitting || !isDirty}
                      isLoading={isSubmitting}
                      leftIcon={<FontAwesomeIcon icon={faSave} />}
                    >
                      Save
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          isDisabled={isDisabled}
                          className="h-10 rounded-l-none"
                          variant="outline_bg"
                          leftIcon={<FontAwesomeIcon icon={faPlus} />}
                        >
                          New policy
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="thin-scrollbar max-h-96" align="end">
                        {Object.keys(PROJECT_PERMISSION_OBJECT)
                          .sort((a, b) =>
                            PROJECT_PERMISSION_OBJECT[
                              a as keyof typeof PROJECT_PERMISSION_OBJECT
                            ].title
                              .toLowerCase()
                              .localeCompare(
                                PROJECT_PERMISSION_OBJECT[
                                  b as keyof typeof PROJECT_PERMISSION_OBJECT
                                ].title.toLowerCase()
                              )
                          )
                          .map((subject) => (
                            <DropdownMenuItem
                              key={`permission-create-${subject}`}
                              className="py-3"
                              onClick={() => onNewPolicy(subject as ProjectPermissionSub)}
                            >
                              {PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub].title}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="py-4">
            {!isPending && <PermissionEmptyState />}
            {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map((subject) => (
              <GeneralPermissionPolicies
                subject={subject}
                actions={PROJECT_PERMISSION_OBJECT[subject].actions}
                title={PROJECT_PERMISSION_OBJECT[subject].title}
                key={`project-permission-${subject}`}
                isDisabled={isDisabled}
              >
                {renderConditionalComponents(subject, isDisabled)}
              </GeneralPermissionPolicies>
            ))}
          </div>
        </FormProvider>
      </form>
    </div>
  );
};
