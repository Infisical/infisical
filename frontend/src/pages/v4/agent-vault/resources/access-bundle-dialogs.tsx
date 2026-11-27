import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { z } from "zod";

import { agentVaultDescriptionSchema } from "@app/helpers/agentVaultDescription";
import type { TAgentVaultAccessBundle } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const nameSchema = slugSchema({ max: 64, field: "Name" });

const issueOf = (schema: z.ZodTypeAny, value: string) => {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

type TBundleRef = Pick<TAgentVaultAccessBundle, "id" | "name" | "description">;

export const AccessBundleDialog = ({
  projectId,
  accessBundle,
  onOpenChange,
  onCreated
}: {
  projectId: string;
  accessBundle?: TBundleRef;
  onOpenChange: (open: boolean) => void;
  onCreated?: (accessBundle: TAgentVaultAccessBundle) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const create = resources.useCreateAccessBundle(projectId);
  const update = resources.useUpdateAccessBundle(projectId);
  const [name, setName] = useState(accessBundle?.name ?? "");
  const [description, setDescription] = useState(accessBundle?.description ?? "");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [pending, setPending] = useState(false);
  const isCreate = !accessBundle;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty:
      name !== (accessBundle?.name ?? "") || description !== (accessBundle?.description ?? ""),
    onDiscard: () => onOpenChange(false)
  });

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>{isCreate ? "Create access bundle" : "Edit access bundle"}</DialogTitle>
          </DialogHeader>
          <form
            id="agent-vault-access-bundle"
            autoComplete="off"
            onSubmit={async (event) => {
              event.preventDefault();
              const next = {
                name: issueOf(nameSchema, name),
                description: issueOf(agentVaultDescriptionSchema, description)
              };
              setErrors(next);
              if (next.name || next.description) return;
              setPending(true);
              try {
                const trimmed = description.trim();
                if (accessBundle) {
                  await update.mutateAsync({
                    accessBundleId: accessBundle.id,
                    name,
                    description: trimmed || null
                  });
                  saved(`Access bundle ${name} updated`);
                  onOpenChange(false);
                } else {
                  const created = await create.mutateAsync({
                    name,
                    description: trimmed || undefined
                  });
                  saved(`Access bundle ${name} created`);
                  onOpenChange(false);
                  onCreated?.(created);
                }
              } catch (error) {
                failed(`Failed to ${isCreate ? "create" : "update"} access bundle`, error);
              } finally {
                setPending(false);
              }
            }}
          >
            <Stack gap={16}>
              <Field
                label="Name"
                error={errors.name}
                description="Use lowercase letters, numbers, and hyphens."
              >
                <Input
                  placeholder="on-call-infrastructure"
                  value={name}
                  maxLength={64}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Description" optional error={errors.description}>
                <Input
                  placeholder="Paging, metrics, issue tracking"
                  value={description}
                  maxLength={256}
                  invalid={Boolean(errors.description)}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={requestDiscard}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="agent-vault-access-bundle"
              loading={pending}
            >
              {isCreate ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};

export const DeleteAccessBundleDialog = ({
  projectId,
  accessBundle,
  onOpenChange,
  onDeleted
}: {
  projectId: string;
  accessBundle?: Pick<TAgentVaultAccessBundle, "id" | "name">;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("agentVaultResources").useDeleteAccessBundle(projectId);
  return (
    <AlertDialog open={Boolean(accessBundle)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText={accessBundle?.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${accessBundle?.name ?? ""}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Its access grants are deleted with it, and its services stay in the project. Any active
            session using this bundle loses access at the next proxy poll. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (!accessBundle) return;
              try {
                await remove.mutateAsync(accessBundle.id);
                saved(`Access bundle ${accessBundle.name} deleted`);
                onOpenChange(false);
                onDeleted?.();
              } catch (error) {
                failed("Failed to delete access bundle", error);
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
