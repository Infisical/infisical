import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useV4PortalContainer } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { type ToastItem, ToastStack } from "@app/components/v4/ui/toast-stack";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { environments, type Resource, type Secret } from "../../secrets-model";

import styles from "./flows.module.css";

export const LOCAL_ONLY = "Saved to local demo data only. No request was sent.";

export const environmentLabel = (value: string) =>
  environments.find((environment) => environment.value === value)?.label ?? value;

export const childPath = (path: string, name: string) => `${path === "/" ? "" : path}/${name}`;

export const folderExists = (
  resources: readonly Resource[],
  project: string,
  environment: string,
  path: string
) => {
  if (path === "/") return true;
  const segments = path.split("/").filter(Boolean);
  const parent = `/${segments.slice(0, -1).join("/")}`;
  return resources.some(
    (resource) =>
      resource.kind === "folder" &&
      resource.project === project &&
      resource.environment === environment &&
      resource.path === parent &&
      resource.name === segments.at(-1)
  );
};

export const secretsAt = (
  resources: readonly Resource[],
  project: string,
  environment: string,
  path: string
) =>
  resources.filter(
    (resource): resource is Secret =>
      resource.kind === "secret" &&
      resource.project === project &&
      resource.environment === environment &&
      resource.path === path
  );

export function Gate({ reason, children }: { reason?: string; children: ReactNode }) {
  if (!reason) return children;
  return (
    <Tooltip content={reason}>
      <span className={styles.gate}>{children}</span>
    </Tooltip>
  );
}

export function DiscardDialog({
  open,
  title = "Discard changes?",
  description = "Your unsaved changes will be lost.",
  keepLabel = "Keep editing",
  onKeep,
  onDiscard
}: {
  open: boolean;
  title?: string;
  description?: string;
  keepLabel?: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onKeep}>
            {keepLabel}
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FlowToasts({
  items,
  onDismiss
}: {
  items: readonly ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const container = useV4PortalContainer();
  return createPortal(
    <ToastStack className={styles.toastDock} items={items} onDismiss={onDismiss} />,
    container ?? document.body
  );
}
