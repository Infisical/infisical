import { useId, useRef, useState } from "react";
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
import { failed, saved } from "../../access/toast";
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
  const slugTouched = useRef(Boolean(environment));
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
                    slug: slugTouched.current ? draft.slug : slugify(name, { lowercase: true })
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
                  slugTouched.current = true;
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

const PendingDeletionCard = ({
  environments,
  canDelete,
  onConfirm
}: {
  environments: ProjectDeletedEnv[];
  canDelete: boolean;
  onConfirm: (confirm: Confirm) => void;
}) => (
  <Card variant="framed" title="Pending deletion" flush>
    <DataTable
      label="Environments pending deletion"
      rows={environments}
      columns={deletedColumns}
      getRowId={(environment) => environment.id}
      rowLabel={(environment) => environment.name}
      rowActions={{
        inline: [
          {
            label: "Restore environment",
            icon: "history",
            disabledReason: () => (canDelete ? undefined : RESTRICTED),
            onSelect: (environment) => onConfirm({ kind: "restore", environment })
          }
        ],
        renderMenu: (environment) => (
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            description={canDelete ? undefined : RESTRICTED}
            onSelect={() => onConfirm({ kind: "hard-delete", environment })}
          >
            <Icon name="trash" />
            Delete now
          </DropdownMenuItem>
        )
      }}
    />
  </Card>
);

const blockedReasons = ({
  canCreate,
  canEdit,
  count,
  limit
}: {
  canCreate: boolean;
  canEdit: boolean;
  count: number;
  limit?: number;
}) => {
  const overLimit = limit ? Math.max(0, count - limit) : 0;
  const planLimit = `Your plan allows ${limit} environments.`;

  let createBlocked: string | undefined;
  if (!canCreate) createBlocked = RESTRICTED;
  else if (limit && count >= limit) createBlocked = `${planLimit} Upgrade to add more.`;

  let editBlocked: string | undefined;
  if (!canEdit) editBlocked = RESTRICTED;
  else if (overLimit > 0)
    editBlocked = `${planLimit} Upgrade, or delete ${overLimit} environment${overLimit === 1 ? "" : "s"}, to edit.`;

  return { createBlocked, editBlocked };
};

const useEnvironmentOrder = (projectId: string, serverOrder: ProjectEnv[] | undefined) => {
  const update = useV4Adapter("projectEnvironments").useUpdateEnvironment();
  const [moving, setMoving] = useState(false);
  const [reordered, setReordered] = useState<{ base: ProjectEnv[]; order: ProjectEnv[] }>();
  const awaitingRefresh = reordered !== undefined && reordered.base === serverOrder;
  const active = (awaitingRefresh ? reordered.order : serverOrder) ?? [];

  const reorder = async (next: ProjectEnv[]) => {
    if (!serverOrder) return;
    const changed = next.flatMap((env, index) => (env.id === active[index].id ? [] : [index]));
    if (changed.length === 0) return;
    const first = changed[0];
    const last = changed[changed.length - 1];
    const movedUp = next[first].id === active[last].id;
    const environment = movedUp ? next[first] : next[last];
    const position = (movedUp ? first : last) + 1;
    setReordered({ base: serverOrder, order: next });
    setMoving(true);
    try {
      await update.mutateAsync({ projectId, id: environment.id, position });
      saved("Environment order saved");
    } catch (error) {
      setReordered(undefined);
      failed("Couldn't save the environment order", error);
    } finally {
      setMoving(false);
    }
  };

  return { active, busy: moving || awaitingRefresh, reorder };
};

export const EnvironmentsSettings = () => {
  const { orgId, projectId } = useProjectScope();
  const adapter = useV4Adapter("projectEnvironments");
  const { data: project, isPending } = adapter.useProject(projectId);
  const { data: environmentLimit } = adapter.useEnvironmentLimit(orgId);
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const [dialog, setDialog] = useState<{ open: boolean; key: number; environment?: ProjectEnv }>({
    open: false,
    key: 0
  });
  const [confirm, setConfirm] = useState<Confirm>();
  const { active, busy, reorder } = useEnvironmentOrder(projectId, project?.environments);

  const can = (action: ProjectPermissionActions) =>
    permission.can(action, ProjectPermissionSub.Environments);
  const canRead = can(ProjectPermissionActions.Read);
  const canEdit = can(ProjectPermissionActions.Edit);
  const canDelete = can(ProjectPermissionActions.Delete);

  const deleted = project?.deletedEnvironments ?? [];
  const { createBlocked, editBlocked } = blockedReasons({
    canCreate: can(ProjectPermissionActions.Create),
    canEdit,
    count: active.length,
    limit: environmentLimit
  });

  const openEdit = (environment: ProjectEnv) => {
    if (!editBlocked) setDialog({ open: true, key: Date.now(), environment });
  };

  const activeColumns: DataTableColumn<ProjectEnv>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 160,
      render: (environment) => environment.name
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
              reorder={canEdit ? { onReorder: reorder, isRowDisabled: () => busy } : undefined}
            />
          ) : (
            <EmptyState size="sm" icon="folder" title="No environments" />
          ))}
      </Card>
      {canRead && deleted.length > 0 && (
        <PendingDeletionCard environments={deleted} canDelete={canDelete} onConfirm={setConfirm} />
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
