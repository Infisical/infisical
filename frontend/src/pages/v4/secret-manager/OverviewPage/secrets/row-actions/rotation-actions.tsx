import { useEffect, useState } from "react";
import type { AxiosError } from "axios";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Switch } from "@app/components/v4/ui/switch";
import {
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { SecretRotation as ApiSecretRotation } from "@app/hooks/api/secretRotationsV2/enums";
import type { TReconcileLocalAccountRotationDTO } from "@app/hooks/api/secretRotationsV2/types";

import { useV4Adapter } from "../../../../data/adapters";
import type { Resource } from "../../secrets-model";
import { SecretRotationFlow } from "../flows/secret-rotation-flow";
import { type RotationResource, rotationTypeOf } from "../flows/secret-rotation/model";
import {
  HpIloRotationMethod,
  SECRET_ROTATION_MAP,
  SecretRotation,
  UnixLinuxLocalAccountRotationMethod,
  WindowsLocalAccountRotationMethod
} from "../flows/secret-rotation/schemas";
import { Gate } from "../flows/shared";
import { useManagedBlock } from "./permissions";
import { RotationCredentialsDialog } from "./rotation-credentials-dialog";
import type { RowAction, RowActionHostProps } from "./types";

type Action = Extract<RowAction, { kind: "rotation" }>;

export const canReconcile = (rotation: Extract<Resource, { kind: "rotation" }>) => {
  const type = rotationTypeOf(rotation);
  const method = rotation.parameters?.rotationMethod;
  return (
    (type === SecretRotation.UnixLinuxLocalAccount &&
      method === UnixLinuxLocalAccountRotationMethod.LoginAsTarget) ||
    (type === SecretRotation.WindowsLocalAccount &&
      method === WindowsLocalAccountRotationMethod.LoginAsTarget) ||
    (type === SecretRotation.HpIloLocalAccount && method === HpIloRotationMethod.LoginAsTarget)
  );
};

const reconcileTypeName = (type: SecretRotation) => {
  if (type === SecretRotation.UnixLinuxLocalAccount) return "Unix/Linux Local Account";
  if (type === SecretRotation.WindowsLocalAccount) return "Windows Local Account";
  return "HP iLO Local Account";
};

function RotateDialog({
  open,
  onOpenChange,
  onRotate,
  block
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRotate: () => void;
  block?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate secrets</DialogTitle>
          <DialogDescription>
            Generates new credentials and retires the current ones.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Gate reason={block}>
            <Button disabled={Boolean(block)} onClick={onRotate}>
              Rotate secrets
            </Button>
          </Gate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconcileDialog({
  open,
  typeName,
  onOpenChange,
  onReconcile,
  block
}: {
  open: boolean;
  typeName: string;
  onOpenChange: (open: boolean) => void;
  onReconcile: () => void;
  block?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile {typeName}</DialogTitle>
          <DialogDescription>
            Makes the password in Infisical match the server. Use it after a failed rotation or a
            manual password change on the server.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Gate reason={block}>
            <Button disabled={Boolean(block)} onClick={onReconcile}>
              Reconcile
            </Button>
          </Gate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  name,
  onOpenChange,
  onDelete,
  block
}: {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onDelete: (options: { revokeGeneratedCredentials: boolean; deleteSecrets: boolean }) => void;
  block?: string;
}) {
  const [typed, setTyped] = useState("");
  const [revokeGeneratedCredentials, setRevokeGeneratedCredentials] = useState(false);
  const [deleteSecrets, setDeleteSecrets] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <Field label={`Type ${name} to confirm`}>
          <Input
            mono
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
        <Switch
          layout="row"
          label="Revoke credentials"
          description={
            revokeGeneratedCredentials
              ? "Generated credentials are revoked."
              : "Generated credentials stay active."
          }
          checked={revokeGeneratedCredentials}
          onCheckedChange={setRevokeGeneratedCredentials}
        />
        <Switch
          layout="row"
          label="Delete secrets"
          description={
            deleteSecrets
              ? "Rotation secrets are removed from the project."
              : "Rotation secrets stay in the project."
          }
          checked={deleteSecrets}
          onCheckedChange={setDeleteSecrets}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Gate reason={block}>
            <AlertDialogAction
              variant="destructive"
              disabled={typed !== name || Boolean(block)}
              onClick={() => onDelete({ revokeGeneratedCredentials, deleteSecrets })}
            >
              Delete
            </AlertDialogAction>
          </Gate>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RotationActions({
  action,
  onClose,
  scope,
  resources,
  onApply,
  onToast
}: RowActionHostProps<"rotation">) {
  const adapter = useV4Adapter("secrets");
  const rotateRotation = adapter.useRotateSecretRotation();
  const deleteRotation = adapter.useDeleteSecretRotation();
  const reconcileRotation = adapter.useReconcileSecretRotation();
  const checkCredentials = adapter.useCheckSecretRotationCredentials();
  const blockFor = useManagedBlock(scope.project);
  const rotationBlock = (rotation: RotationResource, permissionAction: string, verb: string) =>
    blockFor(
      ProjectPermissionSub.SecretRotation,
      permissionAction,
      {
        environment: rotation.environment,
        secretPath: rotation.path,
        ...(rotation.connectionId ? { connectionId: rotation.connectionId } : {})
      },
      verb
    );
  const [last, setLast] = useState<Action | undefined>(action);
  const [session, setSession] = useState(0);
  if (action && action !== last) {
    setLast(action);
    setSession(session + 1);
  }
  const failed = (title: string) => (error: unknown) =>
    onToast("bad", {
      title,
      description:
        (error as AxiosError<{ message?: string }>)?.response?.data?.message ??
        (error instanceof Error ? error.message : undefined)
    });
  const target = (rotation: RotationResource) => ({
    rotationId: rotation.id,
    type: rotationTypeOf(rotation) as unknown as ApiSecretRotation,
    projectId: scope.project,
    secretPath: rotation.path
  });

  const validating = action?.action === "validate" ? action.entry : undefined;
  useEffect(() => {
    if (!validating) return;
    const block = rotationBlock(
      validating,
      ProjectPermissionSecretRotationActions.Read,
      "validate this rotation's credentials"
    );
    if (block) {
      onToast("bad", { title: "Credentials check failed", description: block });
      onClose();
      return;
    }
    checkCredentials
      .mutateAsync(target(validating))
      .then(
        () => onToast("ok", { title: "Credentials are valid" }),
        failed("Credentials check failed")
      );
    onClose();
  }, [validating]);

  if (!last) return null;
  const rotation =
    resources.find(
      (resource): resource is RotationResource =>
        resource.kind === "rotation" && resource.id === last.entry.id
    ) ?? last.entry;
  const type = rotationTypeOf(rotation);
  const rotationType = SECRET_ROTATION_MAP[type].name;
  const isOpen = (kind: Action["action"]) => action?.action === kind;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const rotate = () => {
    rotateRotation
      .mutateAsync(target(rotation))
      .then(
        () => onToast("ok", { title: `Successfully rotated ${rotationType} secrets` }),
        failed(`Failed to rotate ${rotationType} secrets`)
      );
    onClose();
  };

  const reconcile = () => {
    reconcileRotation.mutateAsync(target(rotation) as TReconcileLocalAccountRotationDTO).then(
      (result) =>
        onToast(result.reconciled ? "ok" : "neutral", {
          title: result.reconciled
            ? `${reconcileTypeName(type)} rotation reconciled`
            : `${reconcileTypeName(type)} rotation not reconciled`,
          description: result.message
        }),
      failed(`Failed to reconcile ${reconcileTypeName(type)} rotation`)
    );
    onClose();
  };

  const update = (updated: RotationResource) => {
    onApply(
      (current) => current.map((resource) => (resource.id === rotation.id ? updated : resource)),
      {
        title: `Successfully updated ${rotationType} rotation`
      }
    );
  };

  const remove = ({
    revokeGeneratedCredentials,
    deleteSecrets
  }: {
    revokeGeneratedCredentials: boolean;
    deleteSecrets: boolean;
  }) => {
    deleteRotation
      .mutateAsync({ ...target(rotation), revokeGeneratedCredentials, deleteSecrets })
      .then(
        () => onToast("ok", { title: `Successfully deleted ${rotationType} rotation` }),
        failed(`Failed to delete ${rotationType} rotation`)
      );
    onClose();
  };

  return (
    <>
      {last.action === "credentials" && (
        <RotationCredentialsDialog
          open={isOpen("credentials")}
          rotation={rotation}
          onOpenChange={onOpenChange}
          block={rotationBlock(
            rotation,
            ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
            "view this rotation's generated credentials"
          )}
        />
      )}
      {last.action === "rotate" && (
        <RotateDialog
          open={isOpen("rotate")}
          onOpenChange={onOpenChange}
          onRotate={rotate}
          block={rotationBlock(
            rotation,
            ProjectPermissionSecretRotationActions.RotateSecrets,
            "rotate this rotation's secrets"
          )}
        />
      )}
      {last.action === "reconcile" && (
        <ReconcileDialog
          open={isOpen("reconcile")}
          typeName={reconcileTypeName(type)}
          onOpenChange={onOpenChange}
          onReconcile={reconcile}
          block={rotationBlock(
            rotation,
            ProjectPermissionSecretRotationActions.Edit,
            "reconcile this rotation"
          )}
        />
      )}
      {last.action === "edit" && (
        <SecretRotationFlow
          key={session}
          open={isOpen("edit")}
          onOpenChange={onOpenChange}
          project={scope.project}
          environments={scope.environments}
          environment={rotation.environment}
          secretPath={rotation.path}
          resources={[...resources]}
          rotation={rotation}
          onUpdate={update}
        />
      )}
      {last.action === "delete" && (
        <DeleteDialog
          key={session}
          open={isOpen("delete")}
          name={rotation.name}
          onOpenChange={onOpenChange}
          onDelete={remove}
          block={rotationBlock(
            rotation,
            ProjectPermissionSecretRotationActions.Delete,
            "delete this rotation"
          )}
        />
      )}
    </>
  );
}
