import { useMemo } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { InfoIcon } from "lucide-react";

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
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getProjectBaseURL } from "@app/helpers/project";
import {
  projectIdentityMembershipQuery,
  useCreateIdentityProjectAdditionalPrivilege,
  useCreateProjectIdentity,
  useCreateProjectIdentityMembership,
  useGetProjectRoles,
  useListProjectIdentityMemberships,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import {
  formRolePermission2API,
  RoleTemplates
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

import { PolicyTemplateSelect } from "./PolicyTemplateSelect";
import {
  CreateProjectIdentityMode,
  createProjectIdentitySchema,
  TCreateProjectIdentityForm
} from "./schema";

const UNIVERSAL_AUTH_DEFAULTS = {
  clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
  accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
  accessTokenTTL: 2592000,
  accessTokenMaxTTL: 2592000,
  accessTokenNumUsesLimit: 0,
  accessTokenPeriod: 0,
  lockoutEnabled: true,
  lockoutThreshold: 3,
  lockoutDurationSeconds: 300,
  lockoutCounterResetSeconds: 30
};

// Merge the permissions of the selected templates into a single form-permission
// object (union of actions per subject), then hand off to formRolePermission2API.
const buildTemplatePermissions = (projectType: ProjectType, templateIds: string[]) => {
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
  );
};

type Props = {
  projectId: string;
  projectType: ProjectType;
  canGrantPrivileges: boolean;
  onClose: () => void;
};

export const CreateProjectIdentityForm = ({
  projectId,
  projectType,
  canGrantPrivileges,
  onClose
}: Props) => {
  const navigate = useNavigate();
  const isCertManager = projectType === ProjectType.CertificateManager;

  const { data: roles } = useGetProjectRoles(projectId, projectType);

  const defaultRole = isCertManager
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
  const { mutateAsync: addUniversalAuth } = useAddIdentityUniversalAuth();
  const { mutateAsync: createAdditionalPrivilege } = useCreateIdentityProjectAdditionalPrivilege();

  const onSubmit = async (data: TCreateProjectIdentityForm) => {
    try {
      let identityId: string;

      if (data.mode === CreateProjectIdentityMode.Create) {
        const created = await createProjectIdentity({
          name: data.name!.trim(),
          projectId,
          hasDeleteProtection: true
        });
        identityId = created.id;

        if (data.role?.slug) {
          await updateMembership({
            roles: [{ role: data.role.slug }],
            identityId,
            projectId,
            projectType
          });
        }

        await addUniversalAuth({ projectId, identityId, ...UNIVERSAL_AUTH_DEFAULTS });
      } else {
        identityId = data.identity!.id;
        await createMembership({
          projectId,
          projectType,
          identityId,
          role: data.role?.slug || undefined
        });
      }

      const hasTemplateGrants = data.templateIds.length > 0;
      let grantFailed = false;

      if (hasTemplateGrants && canGrantPrivileges) {
        try {
          await createAdditionalPrivilege({
            identityId,
            projectId,
            permissions: formRolePermission2API(
              buildTemplatePermissions(projectType, data.templateIds) as never
            ),
            type: { isTemporary: false as const }
          });
        } catch {
          grantFailed = true;
        }
      }

      if (grantFailed) {
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

      // Create always lands on the new identity. Assign only navigates when a grant was applied.
      if (data.mode === CreateProjectIdentityMode.Create || (hasTemplateGrants && !grantFailed)) {
        navigate({
          to: `${getProjectBaseURL(projectType)}/identities/$identityId`,
          params: { identityId }
        });
      }
    } catch (err) {
      const message = (err as AxiosError<{ message?: string }>)?.response?.data?.message;
      createNotification({
        text: message ?? "Failed to create machine identity",
        type: "error"
      });
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="mx-auto flex items-center gap-2">
            <Controller
              control={control}
              name="mode"
              render={({ field: { value, onChange } }) => (
                <Tabs
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
                  <TabsList className="w-fit">
                    <TabsTrigger value={CreateProjectIdentityMode.Create}>Create New</TabsTrigger>
                    <TabsTrigger value={CreateProjectIdentityMode.Assign}>
                      Assign Existing
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
            <Tooltip>
              <TooltipTrigger type="button">
                <InfoIcon size={16} className="text-muted" />
              </TooltipTrigger>
              <TooltipContent side="left" align="start" className="max-w-md">
                <p>
                  <span className="font-medium">Create New</span>
                  {" — a dedicated identity managed at the "}
                  {isCertManager ? "Certificate Manager" : "project"} level.
                </p>
                <p className="mt-1.5">
                  <span className="font-medium">Assign Existing</span> — reuse an identity from your
                  organization.
                </p>
              </TooltipContent>
            </Tooltip>
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
                      value={value}
                      onChange={onChange}
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
                Policy Templates <span className="text-muted">(optional)</span>
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
            variant="project"
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
