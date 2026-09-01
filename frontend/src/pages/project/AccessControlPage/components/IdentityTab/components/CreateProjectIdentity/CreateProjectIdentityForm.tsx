import { useMemo } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  SheetFooter,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { getProjectBaseURL } from "@app/helpers/project";
import { PAM_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import {
  projectIdentityMembershipQuery,
  useCreateIdentityProjectAdditionalPrivilege,
  useCreateProjectIdentity,
  useCreateProjectIdentityMembership,
  useGetProjectRoles,
  useListProjectIdentityMemberships,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api";
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

export const CreateProjectIdentityForm = ({
  projectId,
  projectType,
  productLabel,
  canGrantPrivileges,
  onClose
}: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCertManager = projectType === ProjectType.CertificateManager;
  const isPam = projectType === ProjectType.PAM;

  const { data: projectRoles } = useGetProjectRoles(projectId, projectType);

  // PAM product membership is only ever Admin or Member, and PAM has no externally visible project, so
  // the generic role copy ("...over a project") is replaced with the product's own wording.
  const roles = useMemo(() => {
    if (!isPam) return projectRoles;

    return (projectRoles ?? []).flatMap((role) => {
      const productRole = PAM_PRODUCT_ROLE_OPTIONS.find((option) => option.value === role.slug);
      if (!productRole) return [];

      return [{ ...role, name: productRole.label, description: productRole.description }];
    });
  }, [projectRoles, isPam]);

  const defaultRole =
    isCertManager || isPam
      ? { slug: ProjectMembershipRole.Member, name: "Member" }
      : { slug: ProjectMembershipRole.NoAccess, name: "No Access" };

  const form = useForm<TCreateProjectIdentityForm>({
    resolver: zodResolver(createProjectIdentitySchema),
    defaultValues: {
      mode: CreateProjectIdentityMode.Create,
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

  const { data: availableData, isPending: isAvailableLoading } = useQuery({
    ...projectIdentityMembershipQuery.listAvailable({ projectId, projectType }),
    placeholderData: (prev) => prev,
    enabled: mode === CreateProjectIdentityMode.Assign
  });
  const { data: membershipsData } = useListProjectIdentityMemberships(
    { projectId, projectType, limit: 1000 },
    { enabled: mode === CreateProjectIdentityMode.Assign }
  );

  const assignableIdentities = useMemo(() => {
    const alreadyMembers = new Set(
      (membershipsData?.identityMemberships ?? []).map((m) => m.identity.id)
    );
    return (availableData ?? [])
      .filter((i) => !alreadyMembers.has(i.id))
      .map((i) => ({ id: i.id, name: i.name }));
  }, [availableData, membershipsData]);

  const { mutateAsync: createProjectIdentity } = useCreateProjectIdentity();
  const { mutateAsync: updateMembership } = useUpdateProjectIdentityMembership();
  const { mutateAsync: createMembership } = useCreateProjectIdentityMembership();
  const { mutateAsync: addPamProductIdentityMember } = useAddPamProductIdentityMember();
  const { mutateAsync: addUniversalAuth } = useAddIdentityUniversalAuth();
  const { mutateAsync: createAdditionalPrivilege } = useCreateIdentityProjectAdditionalPrivilege();

  const onSubmit = async (data: TCreateProjectIdentityForm) => {
    let authAttachFailed = false;

    try {
      let identityId: string;

      if (data.mode === CreateProjectIdentityMode.Create) {
        // PAM's membership PATCH takes a single product role rather than the generic roles array, so
        // the role is set at creation time instead of through a follow-up membership update.
        const created = await createProjectIdentity({
          name: data.name!.trim(),
          projectId,
          hasDeleteProtection: true,
          ...(isPam && data.role?.slug ? { roles: [{ role: data.role.slug }] } : {})
        });
        identityId = created.id;

        if (!isPam && data.role?.slug) {
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

        // PAM keeps its own add-member endpoint, which enforces the product-admin check, the
        // admin/member-only roles, and the rejection of identities scoped to another project.
        if (isPam) {
          await addPamProductIdentityMember({
            projectId,
            identityId,
            role: data.role.slug
          });
        } else {
          await createMembership({
            projectId,
            projectType,
            identityId,
            role: data.role?.slug || undefined
          });
        }
      }

      // The PAM tab reads its own product-membership list, which the generic mutations don't know about.
      if (isPam) {
        queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
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
                ? "Reuse an existing machine identity from your organization."
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
                    <Input {...field} autoFocus placeholder="Machine 1" isError={Boolean(error)} />
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
                    <FilterableSelect
                      value={value || null}
                      onChange={(newValue) => onChange(newValue || undefined)}
                      isLoading={isAvailableLoading}
                      placeholder="Select machine identity..."
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
                  <FilterableSelect
                    value={value}
                    onChange={onChange}
                    options={roles}
                    placeholder="Select role..."
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                    components={{ Option: RoleOption }}
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
        <SheetFooter className="border-t">
          <Button
            type="submit"
            variant={isPam ? "pam" : "project"}
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            {mode === CreateProjectIdentityMode.Assign ? "Add" : "Create"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
