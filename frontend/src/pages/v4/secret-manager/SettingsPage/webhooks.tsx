import { useState } from "react";
import { format } from "date-fns";
import { PencilIcon, SendIcon } from "lucide-react";
import { z } from "zod";

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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  type TWebhook,
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  WebhookType
} from "@app/hooks/api/webhooks/types";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { dismissToast, saved, toast } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

const eventLabel = (event: WebhookEvent) => {
  const { label } = WEBHOOK_EVENT_METADATA[event];
  return label.charAt(0) + label.slice(1).toLowerCase();
};

const EVENT_OPTIONS = WEBHOOK_EVENTS.map((event) => ({
  value: event,
  label: eventLabel(event),
  description: WEBHOOK_EVENT_METADATA[event].description
}));

const enabledEventsOf = (webhook: TWebhook): WebhookEvent[] => {
  if (webhook.eventsFilter.length === 0) return [...WEBHOOK_EVENTS];
  const filtered = new Set(webhook.eventsFilter.map((entry) => entry.eventName));
  return WEBHOOK_EVENTS.filter((event) => filtered.has(event));
};

const toEventsFilter = (events: readonly string[]) =>
  WEBHOOK_EVENTS.filter((event) => events.includes(event)).map((eventName) => ({ eventName }));

const EventsField = ({
  value,
  onChange
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) => (
  <Field
    wide
    label="Events"
    description={value.length ? undefined : "No events selected. The webhook fires on every event."}
  >
    <MultiSelect
      label="Events"
      placeholder="Select events"
      allLabel="All events"
      options={EVENT_OPTIONS}
      value={value}
      onChange={onChange}
    />
  </Field>
);

const TYPE_OPTIONS = [
  { value: WebhookType.GENERAL, label: "General" },
  { value: WebhookType.SLACK, label: "Slack" },
  { value: WebhookType.MICROSOFT_TEAMS, label: "Microsoft Teams" }
];

const URL_PLACEHOLDER: Record<WebhookType, string> = {
  [WebhookType.GENERAL]: "https://",
  [WebhookType.SLACK]: "https://hooks.slack.com/services/...",
  [WebhookType.MICROSOFT_TEAMS]: "https://<tenant>.webhook.office.com/webhookb2/..."
};

const webhookSchema = z
  .object({
    environment: z.string().trim(),
    webhookUrl: z.string().trim().url("Enter a valid URL"),
    webhookSecretKey: z.string().trim().optional(),
    secretPath: z.string().trim(),
    type: z.nativeEnum(WebhookType)
  })
  .superRefine((data, ctx) => {
    if (data.type === WebhookType.SLACK && !data.webhookUrl.includes("hooks.slack.com")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a Slack incoming webhook URL (hooks.slack.com)",
        path: ["webhookUrl"]
      });
    }
  });

type WebhookDraft = z.infer<typeof webhookSchema>;

const AddWebhookSheet = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const createWebhook = useV4Adapter("projectIntegrations").useCreateWebhook();
  const environments = (project?.environments ?? []).map(({ slug, name }) => ({
    value: slug,
    label: name
  }));
  const blank = (): WebhookDraft => ({
    type: WebhookType.GENERAL,
    environment: environments[0]?.value ?? "",
    secretPath: "",
    webhookUrl: "",
    webhookSecretKey: ""
  });
  const [draft, setDraft] = useState(blank);
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const issues = submitted
    ? webhookSchema.safeParse(draft).error?.flatten().fieldErrors
    : undefined;
  const set = (patch: Partial<WebhookDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const isGeneral = draft.type === WebhookType.GENERAL;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setDraft(blank());
      setEvents([...WEBHOOK_EVENTS]);
      setSubmitted(false);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setSubmitted(true);
    const parsed = webhookSchema.safeParse(draft);
    if (!parsed.success) return;
    setPending(true);
    try {
      await createWebhook.mutateAsync({
        projectId,
        type: parsed.data.type,
        environment: parsed.data.environment,
        secretPath: parsed.data.secretPath,
        webhookUrl: parsed.data.webhookUrl,
        webhookSecretKey: isGeneral ? parsed.data.webhookSecretKey : undefined,
        eventsFilter: toEventsFilter(events)
      });
      saved("Webhook created");
      handleOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent size="md" pending={pending}>
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SheetHeader>
            <SheetTitle>Add webhook</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Stack gap={16}>
              <Field wide label="Type">
                <Select
                  label="Type"
                  value={draft.type}
                  options={TYPE_OPTIONS}
                  onChange={(type) => set({ type: type as WebhookType })}
                />
              </Field>
              <Field wide label="Environment" error={issues?.environment?.[0]}>
                <Select
                  label="Environment"
                  placeholder="Select an environment"
                  value={draft.environment}
                  options={environments}
                  invalid={Boolean(issues?.environment)}
                  onChange={(environment) => set({ environment })}
                />
              </Field>
              <Field
                wide
                label="Secret path"
                description="Enter / to match every secret path in the environment."
                error={issues?.secretPath?.[0]}
              >
                <Input
                  mono
                  placeholder="/"
                  value={draft.secretPath}
                  invalid={Boolean(issues?.secretPath)}
                  onChange={(event) => set({ secretPath: event.target.value })}
                />
              </Field>
              {isGeneral && (
                <Field
                  wide
                  label="Secret key"
                  optional
                  description="Signs each request so you can verify it came from Infisical."
                >
                  <Input
                    placeholder="Provided during webhook setup"
                    value={draft.webhookSecretKey}
                    onChange={(event) => set({ webhookSecretKey: event.target.value })}
                  />
                </Field>
              )}
              <Field
                wide
                label={isGeneral ? "Webhook URL" : "Incoming webhook URL"}
                error={issues?.webhookUrl?.[0]}
              >
                <Input
                  mono
                  placeholder={URL_PLACEHOLDER[draft.type]}
                  value={draft.webhookUrl}
                  invalid={Boolean(issues?.webhookUrl)}
                  onChange={(event) => set({ webhookUrl: event.target.value })}
                />
              </Field>
              <EventsField value={events} onChange={setEvents} />
            </Stack>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" variant="primary" loading={pending}>
              Create webhook
            </Button>
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};

const EditEventsDialog = ({ webhook, onClose }: { webhook: TWebhook; onClose: () => void }) => {
  const { projectId } = useProjectScope();
  const updateWebhook = useV4Adapter("projectIntegrations").useUpdateWebhook();
  const [events, setEvents] = useState<string[]>(() => enabledEventsOf(webhook));
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            try {
              await updateWebhook.mutateAsync({
                webhookId: webhook.id,
                projectId,
                eventsFilter: toEventsFilter(events)
              });
              saved("Webhook events saved");
              onClose();
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <DialogHeader>
              <DialogTitle>Edit webhook events</DialogTitle>
            </DialogHeader>
            <EventsField value={events} onChange={setEvents} />
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Save
              </Button>
            </DialogFooter>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const EventsCell = ({ webhook }: { webhook: TWebhook }) => {
  const enabled = enabledEventsOf(webhook);
  let label = `${enabled.length} event${enabled.length === 1 ? "" : "s"}`;
  if (enabled.length === WEBHOOK_EVENTS.length) label = "All events";
  if (!enabled.length) label = "No events";
  return (
    <Tooltip
      content={
        enabled.length
          ? enabled.map(eventLabel).join(", ")
          : "This webhook isn't triggered by any events."
      }
    >
      <Badge tone="soft">{label}</Badge>
    </Tooltip>
  );
};

const StatusCell = ({ webhook }: { webhook: TWebhook }) => {
  if (webhook.isDisabled)
    return (
      <StatusText tone="neutral" icon="minus">
        Disabled
      </StatusText>
    );
  if (!webhook.lastStatus) return <Muted>-</Muted>;
  const failedRun = webhook.lastStatus === "failed";
  return (
    <Tooltip
      content={
        <Stack gap={4}>
          <span>Last run {format(new Date(webhook.updatedAt), "MMM d, yyyy, h:mm a")}</span>
          {webhook.lastRunErrorMessage && <span>{webhook.lastRunErrorMessage}</span>}
        </Stack>
      }
    >
      <StatusText tone={failedRun ? "bad" : "ok"} icon={failedRun ? "alert-c" : "check-c"}>
        {failedRun ? "Failed" : "Succeeded"}
      </StatusText>
    </Tooltip>
  );
};

export const WebhooksSettings = () => {
  const { projectId } = useProjectScope();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const adapter = useV4Adapter("projectIntegrations");
  const webhooks = adapter.useWebhooks(projectId);
  const updateWebhook = adapter.useUpdateWebhook();
  const testWebhook = adapter.useTestWebhook();
  const deleteWebhook = adapter.useDeleteWebhook();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TWebhook>();
  const [deleting, setDeleting] = useState<TWebhook>();
  const [busy, setBusy] = useState<string>();
  const [deletePending, setDeletePending] = useState(false);

  if (permissionPending) return <Card title="Webhooks" />;
  if (!permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks))
    return <AccessRestricted requirement="read Webhooks" />;

  const canCreate = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
  const canEdit = permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);
  const rows = webhooks.data ?? [];

  const runOn = async (webhook: TWebhook, task: () => Promise<unknown>) => {
    setBusy(webhook.id);
    try {
      await task();
    } finally {
      setBusy(undefined);
    }
  };

  const test = (webhook: TWebhook) =>
    runOn(webhook, async () => {
      const loading = toast({ tone: "loading", title: "Triggering webhook" });
      try {
        await testWebhook.mutateAsync({ webhookId: webhook.id, projectId });
        saved("Webhook triggered");
      } finally {
        dismissToast(loading);
      }
    });

  const toggle = (webhook: TWebhook) =>
    runOn(webhook, async () => {
      await updateWebhook.mutateAsync({
        webhookId: webhook.id,
        projectId,
        isDisabled: !webhook.isDisabled
      });
      saved(webhook.isDisabled ? "Webhook enabled" : "Webhook disabled");
    });

  const columns: DataTableColumn<TWebhook>[] = [
    {
      id: "url",
      header: "URL",
      grow: true,
      mono: true,
      text: (webhook) => webhook.url,
      render: (webhook) => webhook.url
    },
    {
      id: "environment",
      header: "Environment",
      width: 160,
      render: (webhook) => webhook.environment.name
    },
    {
      id: "secretPath",
      header: "Secret path",
      width: 180,
      mono: true,
      render: (webhook) => webhook.secretPath || "/"
    },
    {
      id: "events",
      header: "Events",
      width: 130,
      render: (webhook) => <EventsCell webhook={webhook} />
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      render: (webhook) => <StatusCell webhook={webhook} />
    }
  ];

  const rowActions: DataTableRowActions<TWebhook> = {
    inline: [
      {
        label: "Edit events",
        icon: PencilIcon,
        onSelect: setEditing,
        disabledReason: () => (canEdit ? undefined : RESTRICTED)
      }
    ],
    menuDisabledReason: (webhook) => (busy === webhook.id ? "Updating this webhook" : undefined),
    renderMenu: (webhook) => (
      <>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => test(webhook)}
        >
          <Icon icon={SendIcon} />
          Send test
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => toggle(webhook)}
        >
          <Icon name={webhook.isDisabled ? "check-c" : "minus"} />
          {webhook.isDisabled ? "Enable" : "Disable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setDeleting(webhook)}
        >
          <Icon name="trash" />
          Delete
        </DropdownMenuItem>
      </>
    )
  };

  const hasRows = webhooks.isPending || rows.length > 0;
  return (
    <>
      <Card
        variant="framed"
        title="Webhooks"
        flush={hasRows}
        action={
          <Button
            variant="outline"
            size="xs"
            icon="plus"
            disabledReason={canCreate ? undefined : RESTRICTED}
            onClick={() => setAdding(true)}
          >
            Add webhook
          </Button>
        }
      >
        {hasRows ? (
          <DataTable
            label="Webhooks"
            rows={rows}
            columns={columns}
            rowActions={rowActions}
            getRowId={(webhook) => webhook.id}
            rowLabel={(webhook) => webhook.url}
            loading={webhooks.isPending}
            loadingRows={3}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="link"
            title="No webhooks yet"
            description="Add one to notify an external service when secrets change."
          />
        )}
      </Card>
      <AddWebhookSheet projectId={projectId} open={adding} onOpenChange={setAdding} />
      {editing && <EditEventsDialog webhook={editing} onClose={() => setEditing(undefined)} />}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.url} stops receiving events. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                setDeletePending(true);
                try {
                  await deleteWebhook.mutateAsync({ webhookId: deleting.id, projectId });
                  saved("Webhook deleted");
                  setDeleting(undefined);
                } finally {
                  setDeletePending(false);
                }
              }}
            >
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
