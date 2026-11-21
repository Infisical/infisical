import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";

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
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useDiscardChangesGuard } from "@app/hooks";
import { useUpdateProjectRole } from "@app/hooks/api";
import { invalidateAgentVaultRoleDependents } from "@app/hooks/api/agentVaultRoles";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectRole } from "@app/hooks/api/roles/types";

import { roleDetailsSchema, TRoleDetailsForm } from "./roleSchema";

type Props = {
  role: TProjectRole;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSaved: (role: TProjectRole) => void;
};

export const EditAgentVaultRoleDialog = ({ role, isOpen, onOpenChange, onSaved }: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const updateRole = useUpdateProjectRole();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<TRoleDetailsForm>({ resolver: zodResolver(roleDetailsSchema) });

  useEffect(() => {
    if (isOpen) {
      reset({ name: role.name, slug: role.slug, description: role.description ?? "" });
    }
  }, [isOpen, role, reset]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  const onSubmit = async ({ name, slug, description }: TRoleDetailsForm) => {
    try {
      const updated = await updateRole.mutateAsync({
        id: role.id,
        projectId,
        projectType: ProjectType.AgentVault,
        name,
        slug,
        description
      });
      createNotification({ type: "success", text: `Role "${updated.name}" updated` });
      invalidateAgentVaultRoleDependents(queryClient, currentOrg.id, projectId);
      onOpenChange(false);
      onSaved(updated);
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

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
            <DialogTitle>Edit Role Details</DialogTitle>
            <DialogDescription>
              Rename the role or change its slug. Who holds it and what it grants stay the same.
            </DialogDescription>
          </DialogHeader>

          <form
            id="agent-vault-edit-role"
            onSubmit={handleSubmit(onSubmit)}
            autoComplete="off"
            className="flex flex-col gap-4"
          >
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="agent-vault-edit-role-name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="agent-vault-edit-role-name"
                      data-1p-ignore
                      isError={Boolean(fieldState.error)}
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
                  <FieldLabel htmlFor="agent-vault-edit-role-slug">Slug</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="agent-vault-edit-role-slug"
                      className="font-mono"
                      data-1p-ignore
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldDescription>
                      Scripts that assign this role by its slug need the new one.
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
                  <FieldLabel htmlFor="agent-vault-edit-role-description">Description</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="agent-vault-edit-role-description"
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
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
              form="agent-vault-edit-role"
              variant="av"
              isPending={isSubmitting}
              isDisabled={!isDirty}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this role's details will be lost."
      />
    </>
  );
};
