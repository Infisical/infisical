import { useMemo } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { RoleOptionContent } from "@app/components/roles";
import {
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  SheetFooter,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS, PAM_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import {
  projectIdentityMembershipQuery,
  useCreateIdentityProjectAdditionalPrivilege,
  useCreateProjectIdentity,
  useCreateProjectIdentityMembership,
  useGetProjectRoles,
  useListProjectIdentityMemberships,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api";
import { agentVaultKeys, useAddAgentVaultMembers } from "@app/hooks/api/agentVault";
import { UNIVERSAL_AUTH_DEFAULTS, useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { pamKeys, useAddPamProductIdentityMember } from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import {
  formRolePermission2API,
  RoleTemplates,
  TFormSchema
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

import { PolicyTemplateSelect } from "./PolicyTemplateSelect";
import {
  CreateProjectIdentityMode,
  createProjectIdentitySchema,
  TCreateProjectIdentityForm
} from "./schema";

const SUBMIT_VARIANT_BY_PRODUCT: Partial<Record<ProjectType, "pam" | "av" | "ss">> = {
  [ProjectType.PAM]: "pam",
  [ProjectType.AgentVault]: "av",
  [ProjectType.SecretScanning]: "ss"
};

const buildTemplatePermissions = (
  projectType: ProjectType,
  templateIds: string[]
): TFormSchema["permissions"] => {
  const templates = (RoleTemplates[projectType ?? ProjectType.SecretManager] ?? []).filter(
    (template) => templateIds.includes(template.id)
  );

  const merged: Record<string, Record<string, boolean>> = {};
  templates.forEach((template) => {
    template.permissions.forEach(({ subject, actions }) => {
      merged[subject] = merged[subject] ?? {};
      actions.forEach((action) => {
        merged[subject][action] = true;
      });
    });
  });

  return Object.fromEntries(
    Object.entries(merged).map(([subject, actions]) => [subject, [actions]])
  ) as TFormSchema["permissions"];
};

type Props = {
  projectId: string;
  projectType: ProjectType;
  productLabel: string;
  canGrantPrivileges: boolean;
  onClose: () => void;
};

type TAssignableIdentity = { id: string; name: string };

const ProjectIdentityFormContent = ({
  projectId,
  projectType,
  productLabel,
  canGrantPrivileges,
  onClose,
  assignableIdentities
}: Props & { assignableIdentities: TAssignableIdentity[] }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCertManager = projectType === ProjectType.CertificateManager;
  const isPam = projectType === ProjectType.PAM;
  const isAgentVault = projectType === ProjectType.AgentVault;
  const isProductScoped = isPam || isAgentVault;

  const { currentOrg } = useOrganization();
  const { data: projectRoles } = useGetProjectRoles(projectId, projectType);

  const roles = useMemo(() => {
    if (!isProductScoped) return projectRoles;

    const options = isPam ? PAM_PRODUCT_ROLE_OPTIONS : AGENT_VAULT_PRODUCT_ROLE_OPTIONS;

    return (projectRoles ?? []).flatMap((role) => {
      const productRole = options.find((option) => option.value === role.slug);
      if (!productRole) return [];

      return [{ ...role, name: productRole.label, description: productRole.description }];
    });
  }, [projectRoles, isProductScoped, isPam]);

  const defaultRole =
    isCertManager || isProductScoped
      ? { slug: ProjectMembershipRole.Member, name: "Member" }
      : { slug: ProjectMembershipRole.NoAccess, name: "No Access" };

  const form = useForm<TCreateProjectIdentityForm>({
    resolver: zodResolver(createProjectIdentitySchema),
    defaultValues: {
      mode:
        assignableIdentities.length > 0
          ? CreateProjectIdentityMode.Assign
          : CreateProjectIdentityMode.Create,
      name: "",
      role: defaultRole,
      templateIds: []
    }
  });

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting }
  } = form;

  const mode = useWatch({ control, name: "mode" });

  const { mutateAsync: createProjectIdentity } = useCreateProjectIdentity();
  const { mutateAsync: updateMembership } = useUpdateProjectIdentityMembership();
  const { mutateAsync: createMembership } = useCreateProjectIdentityMembership();
  const { mutateAsync: addPamProductIdentityMember } = useAddPamProductIdentityMember();
  const { mutateAsync: addAgentVaultMembers } = useAddAgentVaultMembers();
  const { mutateAsync: addUniversalAuth } = useAddIdentityUniversalAuth();
  const { mutateAsync: createAdditionalPrivilege } = useCreateIdentityProjectAdditionalPrivilege();

  const onSubmit = async (data: TCreateProjectIdentityForm) => {
    let authAttachFailed = false;

    try {
      let identityId: string;

      if (data.mode === CreateProjectIdentityMode.Create) {
        const created = await createProjectIdentity({
          name: data.name!.trim(),
          projectId,
          hasDeleteProtection: true,
          ...(isProductScoped && data.role?.slug ? { roles: [{ role: data.role.slug }] } : {})
        });
        identityId = created.id;

        if (!isProductScoped && data.role?.slug) {
          await updateMembership({
            roles: [{ role: data.role.slug }],
            identityId,
            projectId,
            projectType
          });
        }

        // The identity and its membership already exist by now, so a failed auth attach must not be
        // reported as a failed creation — retrying would just create a duplicate identity.
        try {
          await addUniversalAuth({ projectId, identityId, ...UNIVERSAL_AUTH_DEFAULTS });
        } catch {
          authAttachFailed = true;
        }
      } else {
        identityId = data.identity!.id;

        // Each product keeps its own add-member endpoint, which enforces the product-admin check, the
        // admin/member-only roles, and the rejection of identities scoped to another project.
        if (isPam) {
          await addPamProductIdentityMember({
            projectId,
            identityId,
            role: data.role.slug
          });
        } else if (isAgentVault) {
          await addAgentVaultMembers({ machineIdentityIds: [identityId], role: data.role.slug });
        } else {
          await createMembership({
            projectId,
            projectType,
            identityId,
            role: data.role?.slug || undefined
          });
        }
      }

      if (isPam) {
        queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
      }
      if (isAgentVault) {
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(currentOrg.id) });
      }

      const hasTemplateGrants = data.templateIds.length > 0;
      let grantFailed = false;

      if (hasTemplateGrants && canGrantPrivileges) {
        try {
          await createAdditionalPrivilege({
            identityId,
            projectId,
            permissions: formRolePermission2API(
              buildTemplatePermissions(projectType, data.templateIds)
            ),
            type: { isTemporary: false as const }
          });
        } catch {
          grantFailed = true;
        }
      }

      if (authAttachFailed) {
        createNotification({
          text: "Machine identity created, but attaching Universal Auth failed. Add an auth method from the identity page.",
          type: "error"
        });
      } else if (grantFailed) {
        createNotification({
          text: `Machine identity ${
            data.mode === CreateProjectIdentityMode.Assign ? "added" : "created"
          }, but applying the policy grant failed. You can add it from the identity page.`,
          type: "error"
        });
      } else {
        createNotification({
          text: `Successfully ${
            data.mode === CreateProjectIdentityMode.Assign ? "added" : "created"
          } machine identity`,
          type: "success"
        });
      }

      onClose();

      if (data.mode === CreateProjectIdentityMode.Create || (hasTemplateGrants && !grantFailed)) {
        navigate({
          to: `${getProjectBaseURL(projectType)}/identities/$identityId`,
          params: { identityId }
        });
      }
    } catch {
      // Error is handled by the mutation's onError handler
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            <Controller
              control={control}
              name="mode"
              render={({ field: { value, onChange } }) => (
                <Tabs
                  className="w-full"
                  value={value}
                  onValueChange={(next) => {
                    onChange(next as CreateProjectIdentityMode);
                    if (next === CreateProjectIdentityMode.Create) {
                      setValue("identity", undefined);
                    } else {
                      setValue("name", "");
                    }
                  }}
                >
                  <TabsList aria-label="Identity assignment mode" className="w-full">
                    <TabsTrigger value={CreateProjectIdentityMode.Create}>Create New</TabsTrigger>
                    <TabsTrigger value={CreateProjectIdentityMode.Assign}>
                      Assign Existing
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
            <p className="text-sm text-muted">
              {mode === CreateProjectIdentityMode.Assign
                ? "Reuse an organization machine identity, which can be added to several projects."
                : `Create a dedicated machine identity managed at the ${productLabel} level.`}
            </p>
          </div>

          {mode === CreateProjectIdentityMode.Create ? (
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      autoFocus
                      placeholder="Machine 1"
                      isError={Boolean(error)}
                      autoComplete="off"
                      name="project-identity-name"
                    />
                  </FieldContent>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
          ) : (
            <Controller
              control={control}
              name="identity"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Machine Identity</FieldLabel>
                  <FieldContent>
                    <Combobox
                      value={value || null}
                      isClearable={false}
                      onValueChange={onChange}
                      placeholder="Select machine identity..."
                      searchAriaLabel="Search machine identities"
                      options={assignableIdentities}
                      getOptionValue={(option) => option.id}
                      getOptionLabel={(option) => option.name}
                      isError={Boolean(error)}
                    />
                  </FieldContent>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
          )}

          <Controller
            control={control}
            name="role"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Role</FieldLabel>
                <FieldContent>
                  <Combobox
                    value={value}
                    isClearable={false}
                    onValueChange={onChange}
                    options={roles}
                    placeholder="Select role..."
                    searchAriaLabel="Search roles"
                    getOptionValue={(option) => option.slug}
                    getOptionKeywords={(option) => [option.slug]}
                    getOptionLabel={(option) => option.name}
                    renderOption={(option) => <RoleOptionContent role={option} />}
                    isError={Boolean(error)}
                  />
                </FieldContent>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />

          {canGrantPrivileges && (
            <Field>
              <FieldLabel>
                Additional Privileges <span className="text-muted">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <PolicyTemplateSelect projectType={projectType} />
              </FieldContent>
            </Field>
          )}
        </div>
        <SheetFooter className="justify-end border-t">
          <Button type="button" variant="outline" onClick={onClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={SUBMIT_VARIANT_BY_PRODUCT[projectType] ?? "project"}
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            {mode === CreateProjectIdentityMode.Assign ? "Add" : "Create"}
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};

export const CreateProjectIdentityForm = (props: Props) => {
  const { projectId, projectType } = props;
  const isProductScoped = projectType === ProjectType.PAM || projectType === ProjectType.AgentVault;

  const { data: availableData, isFetchedAfterMount: isAvailableFresh } = useQuery({
    ...projectIdentityMembershipQuery.listAvailable({ projectId, projectType }),
    refetchOnMount: "always"
  });
  const { data: membershipsData, isFetchedAfterMount: isMembershipsFresh } =
    useListProjectIdentityMemberships(
      { projectId, projectType, limit: 1000 },
      { enabled: isProductScoped, refetchOnMount: "always" }
    );

  const assignableIdentities = useMemo(() => {
    const alreadyMembers = new Set(
      (membershipsData?.identityMemberships ?? []).map((m) => m.identity.id)
    );
    return (availableData ?? [])
      .filter((i) => !alreadyMembers.has(i.id))
      .map((i) => ({ id: i.id, name: i.name }));
  }, [availableData, membershipsData]);

  if (!isAvailableFresh || (isProductScoped && !isMembershipsFresh)) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return <ProjectIdentityFormContent {...props} assignableIdentities={assignableIdentities} />;
};
