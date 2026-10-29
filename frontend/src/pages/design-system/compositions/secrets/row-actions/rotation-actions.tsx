import { useEffect, useState } from "react";

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
import { Text } from "@app/components/v4/ui/text";

import { type Resource, type Secret, versionsOf } from "../../secrets-model";
import { SecretRotationFlow } from "../flows/secret-rotation-flow";
import {
  nextRotationFrom,
  rotationParameters,
  type RotationResource,
  rotationSecrets,
  rotationSecretsMapping,
  rotationTypeOf
} from "../flows/secret-rotation/model";
import {
  HpIloRotationMethod,
  SECRET_ROTATION_MAP,
  SecretRotation,
  UnixLinuxLocalAccountRotationMethod,
  WindowsLocalAccountRotationMethod
} from "../flows/secret-rotation/schemas";
import { LOCAL_ONLY } from "../flows/shared";
import { credentialsOf, rotatedCredentials } from "./rotation-credentials";
import { RotationCredentialsDialog } from "./rotation-credentials-dialog";
import type { RowAction, RowActionHostProps } from "./types";

import styles from "./rotation-actions.module.css";

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

const sameScope = (secret: Secret, rotation: RotationResource) =>
  secret.project === rotation.project &&
  secret.environment === rotation.environment &&
  secret.path === rotation.path;

function RotateDialog({
  open,
  rotationType,
  onOpenChange,
  onRotate
}: {
  open: boolean;
  rotationType: string;
  onOpenChange: (open: boolean) => void;
  onRotate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate secrets</DialogTitle>
          <DialogDescription>Rotate the secrets for this {rotationType}.</DialogDescription>
        </DialogHeader>
        <Text muted>
          Are you sure you want to rotate the secrets for this {rotationType} rotation?
        </Text>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onRotate}>Rotate secrets</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconcileDialog({
  open,
  typeName,
  onOpenChange,
  onReconcile
}: {
  open: boolean;
  typeName: string;
  onOpenChange: (open: boolean) => void;
  onReconcile: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile {typeName}</DialogTitle>
          <DialogDescription>
            Sync the {typeName} password between Infisical and the server.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.body}>
          <Text muted>
            Reconciliation ensures the password stored in Infisical matches the actual password on
            the server.
          </Text>
          <Text muted>
            Use this if you suspect the credentials are out of sync, for example after a failed
            rotation or manual password change on the server.
          </Text>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onReconcile}>Reconcile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  name,
  onOpenChange,
  onDelete
}: {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onDelete: (options: { revokeGeneratedCredentials: boolean; deleteSecrets: boolean }) => void;
}) {
  const [typed, setTyped] = useState("");
  const [revokeGeneratedCredentials, setRevokeGeneratedCredentials] = useState(false);
  const [deleteSecrets, setDeleteSecrets] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
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
          description={`Generated credentials will ${revokeGeneratedCredentials ? "" : "not "}be revoked on deletion${revokeGeneratedCredentials ? "" : " and remain active"}.`}
          checked={revokeGeneratedCredentials}
          onCheckedChange={setRevokeGeneratedCredentials}
        />
        <Switch
          layout="row"
          label="Delete secrets"
          description={`Rotation secrets will ${deleteSecrets ? "" : "not "}be removed from your project on deletion.`}
          checked={deleteSecrets}
          onCheckedChange={setDeleteSecrets}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={typed !== name}
            onClick={() => onDelete({ revokeGeneratedCredentials, deleteSecrets })}
          >
            Delete
          </AlertDialogAction>
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
  const [last, setLast] = useState<Action | undefined>(action);
  const [session, setSession] = useState(0);
  if (action && action !== last) {
    setLast(action);
    setSession(session + 1);
  }

  useEffect(() => {
    if (action?.action !== "validate") return;
    const rotation = action.entry;
    const rotationType = SECRET_ROTATION_MAP[rotationTypeOf(rotation)].name;
    const secrets = rotationSecrets(rotation, resources);
    const keys = Object.values(rotationSecretsMapping(rotation));
    const missing = keys.filter(
      (key) =>
        !Object.values(secrets).some(
          (secret) => secret.name === key && secret.value.status === "present" && secret.value.value
        )
    );
    if (missing.length)
      onToast("bad", {
        title: "Credentials not found",
        description: `${missing.join(", ")} has no current value in local demo data. No request was sent to ${rotationType}.`
      });
    else
      onToast("ok", {
        title: "Credentials checked locally",
        description: `The current rotated credentials for ${rotation.name} are present in local demo data. No request was sent, so nothing authenticated to ${rotationType}.`
      });
    onClose();
  }, [action, resources, onToast, onClose]);

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
    const { active } = credentialsOf(rotation, resources);
    const next = rotatedCredentials(rotation, resources, active);
    const mapping = rotationSecretsMapping(rotation);
    const now = new Date();
    const timestamp = now.toISOString();
    const changed = Object.entries(mapping)
      .filter(([field]) => next[field] !== active[field])
      .map(([, key]) => key);
    onApply(
      (current) =>
        current.map((resource): Resource => {
          if (resource.id === rotation.id && resource.kind === "rotation")
            return {
              ...resource,
              parameters: rotationParameters(resource, current),
              generatedCredentials: [active, next],
              activeIndex: 1,
              status: "success",
              lastRotatedAt: timestamp,
              updatedAt: timestamp,
              nextRotationAt: resource.autoRotation
                ? nextRotationFrom(
                    now,
                    resource.rotationInterval ?? 30,
                    resource.rotateAtUtc ?? { hours: 0, minutes: 0 }
                  )
                : undefined
            };
          if (resource.kind !== "secret" || !sameScope(resource, rotation)) return resource;
          const field = Object.keys(mapping).find((entry) => mapping[entry] === resource.name);
          if (!field || !changed.includes(resource.name)) return resource;
          const version = resource.version + 1;
          const value = next[field];
          return {
            ...resource,
            value: { status: "present", value },
            version,
            updatedAt: timestamp,
            versions: [
              {
                version,
                value,
                createdAt: timestamp,
                actor: rotation.name,
                actorType: "platform"
              },
              ...versionsOf(resource)
            ]
          };
        }),
      {
        title: `Rotated ${rotationType} secrets locally`,
        description: `New fake values for ${changed.join(", ")} in local demo data. No provider request was sent.`
      }
    );
    onClose();
  };

  const reconcile = () => {
    onToast("neutral", {
      title: `${reconcileTypeName(type)} rotation not reconciled`,
      description:
        "This preview has no server to compare against, so the stored password was left unchanged. No request was sent."
    });
    onClose();
  };

  const update = (updated: RotationResource) => {
    const previous = rotationSecretsMapping(rotation);
    const renames = Object.fromEntries(
      Object.entries(previous).map(([field, key]) => [key, updated.secretsMapping?.[field] ?? key])
    );
    onApply(
      (current) =>
        current.map((resource): Resource => {
          if (resource.id === rotation.id) return updated;
          if (resource.kind !== "secret" || !sameScope(resource, rotation)) return resource;
          if (!(resource.name in renames)) return resource;
          const name = renames[resource.name];
          return {
            ...resource,
            name,
            id: `${resource.project}:${resource.environment}:${resource.path}:secret:${name}`,
            managedBy: updated.name
          };
        }),
      { title: `Updated ${rotationType} rotation locally`, description: LOCAL_ONLY }
    );
  };

  const remove = ({
    revokeGeneratedCredentials,
    deleteSecrets
  }: {
    revokeGeneratedCredentials: boolean;
    deleteSecrets: boolean;
  }) => {
    const keys = Object.values(rotationSecretsMapping(rotation));
    const managed = (resource: Resource) =>
      resource.kind === "secret" && sameScope(resource, rotation) && keys.includes(resource.name);
    onApply(
      (current) =>
        current
          .filter(
            (resource) => resource.id !== rotation.id && !(deleteSecrets && managed(resource))
          )
          .map((resource): Resource => {
            if (resource.kind !== "secret" || !managed(resource)) return resource;
            return { ...resource, managedBy: undefined };
          }),
      {
        title: `Deleted ${rotationType} Rotation locally`,
        description: [
          deleteSecrets
            ? `Removed ${keys.join(", ")} from local demo data.`
            : `Kept ${keys.join(", ")} as regular secrets.`,
          revokeGeneratedCredentials
            ? "No credentials were revoked because no request was sent."
            : "No request was sent."
        ].join(" ")
      }
    );
    onClose();
  };

  return (
    <>
      {last.action === "credentials" && (
        <RotationCredentialsDialog
          open={isOpen("credentials")}
          rotation={rotation}
          resources={resources}
          onOpenChange={onOpenChange}
        />
      )}
      {last.action === "rotate" && (
        <RotateDialog
          open={isOpen("rotate")}
          rotationType={rotationType}
          onOpenChange={onOpenChange}
          onRotate={rotate}
        />
      )}
      {last.action === "reconcile" && (
        <ReconcileDialog
          open={isOpen("reconcile")}
          typeName={reconcileTypeName(type)}
          onOpenChange={onOpenChange}
          onReconcile={reconcile}
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
        />
      )}
    </>
  );
}
