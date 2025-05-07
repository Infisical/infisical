import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import { faPlus, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { AccessTree } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { evaluatePermissionsAbility } from "@app/helpers/permissions";
import { usePopUp } from "@app/hooks";
import { useGetProjectRoleBySlug, useUpdateProjectRole } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { PolicySelectionModal } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicySelectionModal";

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
  ProjectTypePermissionSubjects,
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

  const { popUp, handlePopUpToggle } = usePopUp(["addPolicy"] as const);

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

  const isCustomRole = !Object.values(ProjectMembershipRole).includes(
    (role?.slug ?? "") as ProjectMembershipRole
  );

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
                      className={twMerge(
                        "h-10 rounded-r-none border border-primary",
                        isDirty && "bg-primary text-black"
                      )}
                      isDisabled={isSubmitting || !isDirty}
                      isLoading={isSubmitting}
                      leftIcon={<FontAwesomeIcon icon={faSave} />}
                    >
                      Save
                    </Button>
                    <Button
                      isDisabled={isDisabled}
                      className="h-10 rounded-l-none"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => handlePopUpToggle("addPolicy")}
                    >
                      Add Policy
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="py-4">
            {!isPending && <PermissionEmptyState />}
            {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[])
              .filter((subject) => ProjectTypePermissionSubjects[currentWorkspace.type][subject])
              .map((subject) => (
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
          <PolicySelectionModal
            isOpen={popUp.addPolicy.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("addPolicy", isOpen)}
          />
        </FormProvider>
      </form>
    </div>
  );
};
