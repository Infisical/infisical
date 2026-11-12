import { useId, useState } from "react";
import { Alert, AlertDescription } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import slugify from "@sindresorhus/slugify";
import { addDays, format, intervalToDuration } from "date-fns";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type {
  ProjectDeletedEnv,
  ProjectDeletedEnvActor,
  ProjectEnv
} from "@app/hooks/api/projects/types";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

const GRACE_DAYS = 14;

const environmentSchema = z.object({
  name: z.string().min(1, "Enter an environment name"),
  slug: z
    .string()
    .trim()
    .min(1, "Enter a slug")
    .max(64, "Use 64 characters or fewer")
    .refine((value) => slugify(value, { lowercase: true }) === value, {
      message: "Use lowercase letters, numbers, and hyphens"
    })
});

type EnvironmentDraft = z.infer<typeof environmentSchema>;

const actorLabel = (actor: ProjectDeletedEnvActor | null) => {
  if (!actor) return "Someone";
  if (actor.type === "identity") return actor.name || "An identity";
  return actor.firstName || actor.username || actor.email || "A user";
};

const remainingUntil = (target: Date) => {
  const now = new Date();
  if (target.getTime() <= now.getTime()) return null;
  const duration = intervalToDuration({ start: now, end: target });
  const parts = (
    [
      [duration.years, "y"],
      [duration.months, "mo"],
      [duration.days, "d"],
      [duration.hours, "h"],
      [duration.minutes, "m"]
    ] as const
  )
    .filter(([value]) => value && value > 0)
    .slice(0, 2);
  if (parts.length === 0) return "<1m";
  return parts.map(([value, suffix]) => `${value}${suffix}`).join(" ");
};

const EnvironmentDialog = ({
  projectId,
  environment,
  open,
  onOpenChange
}: {
  projectId: string;
  environment?: ProjectEnv;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const adapter = useV4Adapter("projectEnvironments");
  const create = adapter.useCreateEnvironment();
  const update = adapter.useUpdateEnvironment();
  const formId = useId();
  const [draft, setDraft] = useState<EnvironmentDraft>({
    name: environment?.name ?? "",
    slug: environment?.slug ?? ""
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(environment));
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const issues = submitted
    ? environmentSchema.safeParse(draft).error?.flatten().fieldErrors
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{environment ? "Edit environment" : "Create environment"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitted(true);
            const parsed = environmentSchema.safeParse(draft);
            if (!parsed.success) return;
            setPending(true);
            try {
              if (environment) {
                await update.mutateAsync({ projectId, id: environment.id, ...parsed.data });
                saved("Environment updated");
              } else {
                await create.mutateAsync({ projectId, ...parsed.data });
                saved("Environment created");
              }
              onOpenChange(false);
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={issues?.name?.[0]}>
              <Input
                autoComplete="off"
                value={draft.name}
                invalid={Boolean(issues?.name)}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft({
                    name,
                    slug: slugTouched ? draft.slug : slugify(name, { lowercase: true })
                  });
                }}
              />
            </Field>
            <Field
              label="Slug"
              description="Used to reference this environment from the CLI, API, and SDKs."
              error={issues?.slug?.[0]}
            >
              <Input
                mono
                autoComplete="off"
                value={draft.slug}
                invalid={Boolean(issues?.slug)}
                onChange={(event) => {
                  setSlugTouched(true);
                  setDraft({ ...draft, slug: event.target.value });
                }}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending}>
            {environment ? "Save" : "Create environment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type Confirm = { kind: "schedule" | "hard-delete" | "restore"; environment: ProjectEnv };

const ConfirmDialogs = ({
  projectId,
  confirm,
  onClose,
  onSwitch
}: {
  projectId: string;
  confirm?: Confirm;
  onClose: () => void;
  onSwitch: (next: Confirm) => void;
}) => {
  const adapter = useV4Adapter("projectEnvironments");
  const remove = adapter.useDeleteEnvironment();
  const restore = adapter.useRestoreEnvironment();
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(confirm);
  if (confirm && confirm !== shown) setShown(confirm);
  const environment = shown?.environment;

  const run = async (action: () => Promise<unknown>, message: string) => {
    setPending(true);
    const done = await action().then(
      () => true,
      () => false
    );
    setPending(false);
    if (!done) return;
    saved(message);
    onClose();
  };

  const onOpenChange = (open: boolean) => {
    if (!open && !pending) onClose();
  };

  return (
    <>
      <AlertDialog open={confirm?.kind === "schedule"} onOpenChange={onOpenChange}>
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule deletion of {environment?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It becomes inaccessible now and is permanently deleted on{" "}
              {format(addDays(new Date(), GRACE_DAYS), "MMM d, yyyy")}. Until then you can restore
              it with its secrets, folders, and history. After that, its secret data is wiped and
              can&apos;t be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert tone="warn">
            <AlertDescription>
              Service tokens and integrations that reference {environment?.slug} stop resolving. Fix
              or remove them before the grace period ends.
            </AlertDescription>
          </Alert>
          <AlertDialogFooter>
            <Button
              variant="danger-ghost"
              size="sm"
              disabled={pending}
              onClick={() => environment && onSwitch({ kind: "hard-delete", environment })}
            >
              Delete now
            </Button>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (!environment) return;
                run(
                  () => remove.mutateAsync({ projectId, id: environment.id }),
                  "Environment scheduled for deletion"
                );
              }}
            >
              Schedule deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm?.kind === "hard-delete"} onOpenChange={onOpenChange}>
        <AlertDialogContent tone="danger" confirmText={environment?.slug} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {environment?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This skips the grace period. Its secrets, folders, and history are wiped now and
              can&apos;t be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert tone="bad">
            <AlertDescription>
              Service tokens and integrations that reference {environment?.slug} fail immediately.
            </AlertDescription>
          </Alert>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (!environment) return;
                run(
                  () => remove.mutateAsync({ projectId, id: environment.id, hardDelete: true }),
                  "Environment deleted"
                );
              }}
            >
              Delete now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm?.kind === "restore"} onOpenChange={onOpenChange}>
        <AlertDialogContent tone="neutral" icon="history" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {environment?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It becomes accessible again with its secrets, folders, and history, and service tokens
              and integrations that reference {environment?.slug} resolve again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!environment) return;
                run(
                  () => restore.mutateAsync({ projectId, id: environment.id }),
                  "Environment restored"
                );
              }}
            >
              Restore environment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const PendingDeletion = ({ environment }: { environment: ProjectDeletedEnv }) => {
  const deleteAfter = new Date(environment.deleteAfter);
  const remaining = remainingUntil(deleteAfter);
  return (
    <Tooltip
      content={
        <>
          {remaining
            ? `Scheduled for ${format(deleteAfter, "MMM d, yyyy, h:mm a")}`
            : "Awaiting the next daily cleanup"}
          <br />
          Deleted by {actorLabel(environment.deletedBy)} on{" "}
          {format(new Date(environment.softDeletedAt), "MMM d, yyyy")}
        </>
      }
    >
      <StatusText tone="warn" icon="clock" tabIndex={0}>
        {remaining ? `Deletes in ${remaining}` : "Deleting soon"}
      </StatusText>
    </Tooltip>
  );
};

export const EnvironmentsSettings = () => {
  const { orgId, projectId } = useProjectScope();
  const adapter = useV4Adapter("projectEnvironments");
  const { data: project, isPending } = adapter.useProject(projectId);
  const { data: environmentLimit } = adapter.useEnvironmentLimit(orgId);
  const update = adapter.useUpdateEnvironment();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const [dialog, setDialog] = useState<{ open: boolean; key: number; environment?: ProjectEnv }>({
    open: false,
    key: 0
  });
  const [confirm, setConfirm] = useState<Confirm>();
  const [moving, setMoving] = useState(false);

  const can = (action: ProjectPermissionActions) =>
    permission.can(action, ProjectPermissionSub.Environments);
  const canRead = can(ProjectPermissionActions.Read);
  const canEdit = can(ProjectPermissionActions.Edit);
  const canDelete = can(ProjectPermissionActions.Delete);

  const active = project?.environments ?? [];
  const deleted = project?.deletedEnvironments ?? [];
  const overLimit = environmentLimit ? Math.max(0, active.length - environmentLimit) : 0;
  const planLimit = `Your plan allows ${environmentLimit} environments.`;

  let createBlocked: string | undefined;
  if (!can(ProjectPermissionActions.Create)) createBlocked = RESTRICTED;
  else if (environmentLimit && active.length >= environmentLimit)
    createBlocked = `${planLimit} Upgrade to add more.`;

  let editBlocked: string | undefined;
  if (!canEdit) editBlocked = RESTRICTED;
  else if (overLimit > 0)
    editBlocked = `${planLimit} Upgrade, or delete ${overLimit} environment${overLimit === 1 ? "" : "s"}, to edit.`;

  let moveBlocked: string | undefined;
  if (!canEdit) moveBlocked = RESTRICTED;
  else if (moving) moveBlocked = "Saving the new order";

  const openEdit = (environment: ProjectEnv) => {
    if (!editBlocked) setDialog({ open: true, key: Date.now(), environment });
  };

  const move = async (environment: ProjectEnv, position: number) => {
    setMoving(true);
    const done = await update.mutateAsync({ projectId, id: environment.id, position }).then(
      () => true,
      () => false
    );
    setMoving(false);
    if (done) saved("Environment order saved");
  };

  const indexOf = (environment: ProjectEnv) => active.findIndex((env) => env.id === environment.id);

  const activeColumns: DataTableColumn<ProjectEnv>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      render: (environment) => (
        <Button
          variant="link"
          underline="hover"
          disabledReason={editBlocked}
          onClick={() => openEdit(environment)}
        >
          {environment.name}
        </Button>
      )
    },
    {
      id: "slug",
      header: "Slug",
      mono: true,
      width: 280,
      render: (environment) => environment.slug
    }
  ];

  const activeActions: DataTableRowActions<ProjectEnv> = {
    inline: [
      {
        label: "Move up",
        icon: "arrow-up",
        disabledReason: (environment) =>
          moveBlocked ?? (indexOf(environment) === 0 ? "Already first" : undefined),
        onSelect: (environment) => move(environment, Math.max(1, indexOf(environment)))
      },
      {
        label: "Move down",
        icon: "arrow-down",
        disabledReason: (environment) =>
          moveBlocked ?? (indexOf(environment) === active.length - 1 ? "Already last" : undefined),
        onSelect: (environment) =>
          move(environment, Math.min(active.length, indexOf(environment) + 2))
      }
    ],
    renderMenu: (environment) => (
      <>
        <DropdownMenuItem
          disabled={Boolean(editBlocked)}
          description={editBlocked}
          onSelect={() => openEdit(environment)}
        >
          <Icon icon={PencilIcon} />
          Edit environment
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setConfirm({ kind: "schedule", environment })}
        >
          <Icon name="trash" />
          Delete environment
        </DropdownMenuItem>
      </>
    )
  };

  const deletedColumns: DataTableColumn<ProjectDeletedEnv>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      render: (environment) => environment.name
    },
    {
      id: "slug",
      header: "Slug",
      mono: true,
      width: 200,
      render: (environment) => environment.slug
    },
    {
      id: "status",
      header: "Status",
      width: 180,
      render: (environment) => <PendingDeletion environment={environment} />
    }
  ];

  const deletedActions: DataTableRowActions<ProjectDeletedEnv> = {
    inline: [
      {
        label: "Restore environment",
        icon: "history",
        disabledReason: () => (canDelete ? undefined : RESTRICTED),
        onSelect: (environment) => setConfirm({ kind: "restore", environment })
      }
    ],
    renderMenu: (environment) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canDelete}
        description={canDelete ? undefined : RESTRICTED}
        onSelect={() => setConfirm({ kind: "hard-delete", environment })}
      >
        <Icon name="trash" />
        Delete now
      </DropdownMenuItem>
    )
  };

  const loading = isPending || permissionPending;
  const hasRows = loading || active.length > 0;

  return (
    <Stack gap={24}>
      <Card
        variant="framed"
        title="Environments"
        flush={canRead && hasRows}
        action={
          <Button
            variant="accent"
            size="xs"
            icon="plus"
            disabledReason={createBlocked}
            onClick={() => setDialog({ open: true, key: Date.now() })}
          >
            Create environment
          </Button>
        }
      >
        {!loading && !canRead && <AccessRestricted />}
        {(loading || canRead) &&
          (hasRows ? (
            <DataTable
              label="Environments"
              rows={active}
              columns={activeColumns}
              loading={loading}
              loadingRows={3}
              getRowId={(environment) => environment.id}
              rowLabel={(environment) => environment.name}
              onRowActivate={editBlocked ? undefined : openEdit}
              rowActions={activeActions}
            />
          ) : (
            <EmptyState size="sm" icon="folder" title="No environments" />
          ))}
      </Card>
      {canRead && deleted.length > 0 && (
        <Card variant="framed" title="Pending deletion" flush>
          <DataTable
            label="Environments pending deletion"
            rows={deleted}
            columns={deletedColumns}
            getRowId={(environment) => environment.id}
            rowLabel={(environment) => environment.name}
            rowActions={deletedActions}
          />
        </Card>
      )}
      <EnvironmentDialog
        key={dialog.key}
        projectId={projectId}
        environment={dialog.environment}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
      <ConfirmDialogs
        projectId={projectId}
        confirm={confirm}
        onClose={() => setConfirm(undefined)}
        onSwitch={setConfirm}
      />
    </Stack>
  );
};
