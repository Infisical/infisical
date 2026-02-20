import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { SaveIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { AccessTree } from "@app/components/permissions";
import { Button, UnstableAccordion } from "@app/components/v3";
import { ProjectPermissionSub, useProject } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { evaluatePermissionsAbility } from "@app/helpers/permissions";
import {
  useGetProjectRoleBySlug,
  useGetWorkspaceIntegrations,
  useUpdateProjectRole
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddPoliciesButton } from "./AddPoliciesButton";
import { AppConnectionPermissionConditions } from "./AppConnectionPermissionConditions";
import { CertificateAuthorityPermissionConditions } from "./CertificateAuthorityPermissionConditions";
import { CertificatePermissionConditions } from "./CertificatePermissionConditions";
import { CertificatePolicyPermissionConditions } from "./CertificatePolicyPermissionConditions";
import { CertificateProfilePermissionConditions } from "./CertificateProfilePermissionConditions";
import { DynamicSecretPermissionConditions } from "./DynamicSecretPermissionConditions";
import { GeneralPermissionConditions } from "./GeneralPermissionConditions";
import { GeneralPermissionPolicies } from "./GeneralPermissionPolicies";
import { IdentityManagementPermissionConditions } from "./IdentityManagementPermissionConditions";
import { McpEndpointPermissionConditions } from "./McpEndpointPermissionConditions";
import { PamAccountPermissionConditions } from "./PamAccountPermissionConditions";
import { PermissionEmptyState } from "./PermissionEmptyState";
import { PkiSubscriberPermissionConditions } from "./PkiSubscriberPermissionConditions";
import { PkiSyncPermissionConditions } from "./PkiSyncPermissionConditions";
import { PkiTemplatePermissionConditions } from "./PkiTemplatePermissionConditions";
import {
  EXCLUDED_PERMISSION_SUBS,
  formRolePermission2API,
  isConditionalSubjects,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  ProjectTypePermissionSubjects,
  rolePermission2Form,
  TFormSchema
} from "./ProjectRoleModifySection.utils";
import { SecretEventPermissionConditions } from "./SecretEventPermissionConditions";
import { SecretPermissionConditions } from "./SecretPermissionConditions";
import { SecretRotationPermissionConditions } from "./SecretRotationPermissionConditions";
import { SecretSyncPermissionConditions } from "./SecretSyncPermissionConditions";
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

    if (subject === ProjectPermissionSub.PkiSubscribers) {
      return <PkiSubscriberPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.CertificateTemplates) {
      return <PkiTemplatePermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.SecretSyncs) {
      return <SecretSyncPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.PkiSyncs) {
      return <PkiSyncPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.SecretEventSubscriptions) {
      return <SecretEventPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.AppConnections) {
      return <AppConnectionPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.PamAccounts) {
      return <PamAccountPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.CertificateAuthorities) {
      return <CertificateAuthorityPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.Certificates) {
      return <CertificatePermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.CertificateProfiles) {
      return <CertificateProfilePermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.CertificatePolicies) {
      return <CertificatePolicyPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.McpEndpoints) {
      return <McpEndpointPermissionConditions isDisabled={isDisabled} />;
    }

    if (subject === ProjectPermissionSub.SecretRotation) {
      return <SecretRotationPermissionConditions isDisabled={isDisabled} />;
    }

    return <GeneralPermissionConditions isDisabled={isDisabled} type={subject} />;
  }

  return undefined;
};

export const RolePermissionsSection = ({ roleSlug, isDisabled }: Props) => {
  const { currentProject, projectId } = useProject();

  const isSecretManagerProject = currentProject.type === ProjectType.SecretManager;

  const { data: role, isPending } = useGetProjectRoleBySlug(projectId, roleSlug as string);
  const { data: integrations = [] } = useGetWorkspaceIntegrations(projectId, {
    enabled: isSecretManagerProject,
    refetchInterval: false
  });
  const hasNativeIntegrations = integrations.length > 0;

  const [showAccessTree, setShowAccessTree] = useState<ProjectPermissionSub | null>(null);
  const [openPolicies, setOpenPolicies] = useState<string[]>([]);

  const form = useForm<TFormSchema>({
    resolver: zodResolver(projectRoleFormSchema)
  });

  const {
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = form;

  // This is to reset the form so that the form is not dirty when the role is loaded
  useEffect(() => {
    if (role) {
      reset({ ...role, permissions: rolePermission2Form(role.permissions) });
    }
  }, [role, reset]);

  const { mutateAsync: updateRole } = useUpdateProjectRole();

  const onSubmit = async (el: TFormSchema) => {
    if (!projectId || !role?.id) return;
    await updateRole({
      id: role?.id as string,
      projectId,
      ...el,
      permissions: formRolePermission2API(el.permissions)
    });
    createNotification({ type: "success", text: "Successfully updated role" });
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full w-full flex-1 flex-col rounded-lg border border-border bg-card py-4"
      >
        <FormProvider {...form}>
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
                    disabled={isSubmitting}
                    onClick={() => reset()}
                  >
                    Discard
                  </Button>
                )}
                <Button variant="project" type="submit" disabled={isSubmitting || !isDirty}>
                  <SaveIcon className="size-4" />
                  Save
                </Button>
                <div className="ml-2 border-l border-border pl-4">
                  <AddPoliciesButton
                    isDisabled={isDisabled}
                    projectType={currentProject.type}
                    projectId={projectId}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col overflow-hidden px-4">
            <div className="thin-scrollbar flex-1 overflow-y-scroll py-4">
              {!isPending && <PermissionEmptyState />}
              <UnstableAccordion
                type="multiple"
                value={openPolicies}
                onValueChange={setOpenPolicies}
                className="overflow-clip rounded-md border border-border bg-container hover:bg-container-hover"
              >
                {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[])
                  .filter((subject) => !EXCLUDED_PERMISSION_SUBS.includes(subject))
                  .filter((subject) => ProjectTypePermissionSubjects[currentProject.type][subject])
                  .filter(
                    (subject) =>
                      // Hide Native Integrations policy if project has no integrations
                      subject !== ProjectPermissionSub.Integrations || hasNativeIntegrations
                  )
                  .map((subject) => (
                    <GeneralPermissionPolicies
                      subject={subject}
                      actions={PROJECT_PERMISSION_OBJECT[subject].actions}
                      title={PROJECT_PERMISSION_OBJECT[subject].title}
                      description={PROJECT_PERMISSION_OBJECT[subject].description}
                      key={`project-permission-${subject}`}
                      isDisabled={isDisabled}
                      isOpen={openPolicies.includes(subject)}
                      onShowAccessTree={
                        [
                          ProjectPermissionSub.Secrets,
                          ProjectPermissionSub.SecretFolders,
                          ProjectPermissionSub.DynamicSecrets,
                          ProjectPermissionSub.SecretImports
                        ].includes(subject)
                          ? setShowAccessTree
                          : undefined
                      }
                    >
                      {renderConditionalComponents(subject, isDisabled)}
                    </GeneralPermissionPolicies>
                  ))}
              </UnstableAccordion>
            </div>
          </div>
        </FormProvider>
      </form>
      {isSecretManagerProject && showAccessTree && (
        <AccessTree
          permissions={formattedPermissions}
          subject={showAccessTree}
          onClose={() => setShowAccessTree(null)}
        />
      )}
    </div>
  );
};
