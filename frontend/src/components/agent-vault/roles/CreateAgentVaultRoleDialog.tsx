import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  AGENT_VAULT_ROLE_TEMPLATES,
  policyToRules
} from "@app/components/agent-vault/policy-editor/agentVaultPolicyModel";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useDiscardChangesGuard } from "@app/hooks";
import { useCreateProjectRole } from "@app/hooks/api";
import {
  fetchAgentVaultRoleBySlug,
  invalidateAgentVaultRoleDependents,
  useAgentVaultRoleOptions
} from "@app/hooks/api/agentVaultRoles";
import { ProjectType } from "@app/hooks/api/projects/types";
import { roleQueryKeys } from "@app/hooks/api/roles/queries";
import { ProjectMembershipRole, TProjectPermission } from "@app/hooks/api/roles/types";

import { agentVaultRoleRules, roleDetailsSchema, rulesForCopy, toRoleSlug } from "./roleSchema";

const BLANK_SOURCE = "blank";
const TEMPLATE_PREFIX = "template:";
const COPY_PREFIX = "copy:";

const schema = roleDetailsSchema.extend({ source: z.string() });

type TForm = z.infer<typeof schema>;

export type TRoleToCopy = { slug: string; name: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Opens as Duplicate, starting from a copy of this role.
  copyFrom?: TRoleToCopy | null;
};

const defaultsFor = (copyFrom?: TRoleToCopy | null): TForm =>
  copyFrom
    ? {
        name: `${copyFrom.name} Copy`,
        slug: toRoleSlug(`${copyFrom.name} Copy`),
        description: "",
        source: `${COPY_PREFIX}${copyFrom.slug}`
      }
    : { name: "", slug: "", description: "", source: BLANK_SOURCE };

export const CreateAgentVaultRoleDialog = ({
  isOpen,
  onOpenChange,
  copyFrom: copyFromProp
}: Props) => {
  // Kept through the close animation, after the caller has cleared it.
  const lastCopyFrom = useRef(copyFromProp);
  if (isOpen) lastCopyFrom.current = copyFromProp;
  const copyFrom = isOpen ? copyFromProp : lastCopyFrom.current;

  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const createRole = useCreateProjectRole();
  const { builtIn: builtInRoles, custom: customRoles } = useAgentVaultRoleOptions(projectId);
  // A copy of No Access is the same as starting blank.
  const copyableRoles = [
    ...builtInRoles.filter((role) => role.slug !== ProjectMembershipRole.NoAccess),
    ...customRoles
  ];

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getFieldState,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({ resolver: zodResolver(schema), defaultValues: defaultsFor(copyFrom) });

  useEffect(() => {
    if (isOpen) reset(defaultsFor(copyFrom));
  }, [isOpen, copyFrom?.slug, copyFrom?.name, reset]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  const permissionsFor = async (source: string): Promise<TProjectPermission[]> => {
    if (source.startsWith(TEMPLATE_PREFIX)) {
      const template = AGENT_VAULT_ROLE_TEMPLATES.find(
        ({ id }) => id === source.slice(TEMPLATE_PREFIX.length)
      );
      return template ? policyToRules(template.policy) : [];
    }
    if (source.startsWith(COPY_PREFIX)) {
      const slug = source.slice(COPY_PREFIX.length);
      const role = await queryClient.fetchQuery({
        queryKey: roleQueryKeys.getProjectRoleBySlug(projectId, slug),
        queryFn: () => fetchAgentVaultRoleBySlug(projectId, slug)
      });
      return rulesForCopy(agentVaultRoleRules(role));
    }
    return [];
  };

  // Agent Vault's custom roles need no plan: past Admin and No Access, they are the only way to give anyone access.
  const onSubmit = async ({ name, slug, description, source }: TForm) => {
    let permissions: TProjectPermission[];
    try {
      permissions = await permissionsFor(source);
    } catch {
      createNotification({
        type: "error",
        text: "Could not read the role to copy. Check your connection and try again."
      });
      return;
    }

    try {
      const role = await createRole.mutateAsync({
        projectId,
        projectType: ProjectType.AgentVault,
        name,
        slug,
        description,
        permissions
      });
      createNotification({ type: "success", text: `Role "${role.name}" created` });
      invalidateAgentVaultRoleDependents(queryClient, currentOrg.id, projectId);
      onOpenChange(false);
      navigate({
        to: "/organizations/$orgId/projects/agent-vault/$projectId/roles/$roleSlug",
        params: { orgId: currentOrg.id, projectId, roleSlug: role.slug }
      });
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  const isDuplicate = Boolean(copyFrom);

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestDiscard();
        }}
      >
        <DialogContent isPending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>{isDuplicate ? "Duplicate Role" : "Create Role"}</DialogTitle>
            <DialogDescription>
              A role grants exactly what it lists, and nothing else. Pick its access bundles,
              services, skills and capabilities after you create it.
            </DialogDescription>
          </DialogHeader>

          <form
            id="agent-vault-create-role"
            onSubmit={handleSubmit(onSubmit)}
            autoComplete="off"
            className="flex flex-col gap-4"
          >
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, ...field }, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="agent-vault-role-name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="agent-vault-role-name"
                      placeholder="Release Engineers"
                      data-1p-ignore
                      isError={Boolean(fieldState.error)}
                      onChange={(event) => {
                        onChange(event);
                        if (getFieldState("slug").isDirty) return;
                        setValue("slug", toRoleSlug(event.target.value), { shouldValidate: true });
                      }}
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="slug"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="agent-vault-role-slug">Slug</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="agent-vault-role-slug"
                      placeholder="release-engineers"
                      className="font-mono"
                      data-1p-ignore
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldDescription>
                      Names the role when you assign it through the API or CLI.
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="agent-vault-role-description">Description</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="agent-vault-role-description"
                      placeholder="Ship releases with the GitHub and Linear services"
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="agent-vault-role-source">Start From</FieldLabel>
                  <FieldContent>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="agent-vault-role-source" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                        <SelectGroup>
                          <SelectItem
                            value={BLANK_SOURCE}
                            description="Holders can do nothing until you add permissions."
                          >
                            Blank
                          </SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Templates</SelectLabel>
                          {AGENT_VAULT_ROLE_TEMPLATES.map((template) => (
                            <SelectItem
                              key={template.id}
                              value={`${TEMPLATE_PREFIX}${template.id}`}
                              description={template.description}
                            >
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {copyableRoles.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Copy a Role</SelectLabel>
                            {copyableRoles.map((role) => (
                              <SelectItem
                                key={role.slug}
                                value={`${COPY_PREFIX}${role.slug}`}
                                description={role.description || role.slug}
                              >
                                Copy of {role.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      You can change everything it grants after you create it.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </form>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              isDisabled={isSubmitting}
              onClick={requestDiscard}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="agent-vault-create-role"
              variant="av"
              isPending={isSubmitting}
            >
              {isDuplicate ? "Duplicate Role" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Role Setup?"
        description="Your progress setting up this role will be lost."
      />
    </>
  );
};
