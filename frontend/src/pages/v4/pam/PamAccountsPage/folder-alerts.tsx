import { useRef, useState } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import { PamEnterpriseAlertingUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  ALERT_EVENT_TYPE_DESCRIPTIONS,
  ALERT_RESOURCE_EVENT_TYPES,
  type AlertChannelType,
  AlertEventType,
  AlertResourceType,
  channelFormSchema,
  type TAlert
} from "@app/hooks/api/alerts/types";
import { toChannelForm, toChannelInput } from "@app/hooks/api/alerts/utils";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { failed, readableFailure, saved } from "../../access/toast";
import { ChannelsStep } from "../../cert-manager/SettingsPage/alert-channels";
import {
  buildNextChannel,
  MAX_CHANNELS,
  type TMemberEmails,
  toMemberEmails
} from "../../cert-manager/SettingsPage/alert-model";
import { useV4Adapter } from "../../data/adapters";
import { ConfirmAction } from "./confirm-action";

const PAM_EVENT_TYPES = ALERT_RESOURCE_EVENT_TYPES[AlertResourceType.PamFolder];

const EVENT_LABELS: Partial<Record<AlertEventType, string>> = {
  [AlertEventType.PamAccessRequested]: "Access requested",
  [AlertEventType.PamAccessRequestApproved]: "Request approved",
  [AlertEventType.PamAccessRequestDenied]: "Request denied",
  [AlertEventType.PamAccessRequestBypassed]: "Break-glass used"
};

const DEFAULT_NAMES: Partial<Record<AlertEventType, string>> = {
  [AlertEventType.PamAccessRequested]: "Access requested alert",
  [AlertEventType.PamAccessRequestApproved]: "Request approved alert",
  [AlertEventType.PamAccessRequestDenied]: "Request denied alert",
  [AlertEventType.PamAccessRequestBypassed]: "Break-glass alert"
};

const formSchema = z.object({
  eventType: z.nativeEnum(AlertEventType),
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000),
  enabled: z.boolean(),
  channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
});
type TForm = z.infer<typeof formSchema>;

const DetailsStep = ({ isEditing, used }: { isEditing: boolean; used: AlertEventType[] }) => {
  const { control, register, setValue, getValues, formState } = useFormContext<TForm>();
  const [eventType, enabled] = useWatch({ control, name: ["eventType", "enabled"] });
  const { errors } = formState;
  return (
    <Stack gap={16}>
      <Field wide label="Event" description={ALERT_EVENT_TYPE_DESCRIPTIONS[eventType]}>
        <Select
          label="Event"
          value={eventType}
          disabled={isEditing}
          options={PAM_EVENT_TYPES.map((event) => ({
            value: event,
            label: EVENT_LABELS[event] ?? event,
            disabled: used.includes(event)
          }))}
          onChange={(value) => {
            const next = value as AlertEventType;
            if (getValues("name") === DEFAULT_NAMES[eventType])
              setValue("name", DEFAULT_NAMES[next] ?? "", { shouldDirty: true });
            setValue("eventType", next, { shouldDirty: true });
          }}
        />
      </Field>
      <Field wide label="Name" error={errors.name?.message}>
        <Input {...register("name")} invalid={Boolean(errors.name)} autoComplete="off" />
      </Field>
      <Field wide label="Description" optional error={errors.description?.message}>
        <Textarea
          {...register("description")}
          rows={3}
          aria-invalid={Boolean(errors.description) || undefined}
        />
      </Field>
      <Switch
        layout="row"
        label="Enabled"
        checked={enabled}
        onCheckedChange={(checked) => setValue("enabled", checked, { shouldDirty: true })}
      />
    </Stack>
  );
};

const AlertWizard = ({
  open,
  onOpenChange,
  alert,
  folderId,
  projectId,
  used,
  members,
  hasEnterprise
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alert?: TAlert;
  folderId: string;
  projectId: string;
  used: AlertEventType[];
  members: TMemberEmails;
  hasEnterprise: boolean;
}) => {
  const settings = useV4Adapter("certManagerSettings");
  const createAlert = settings.useCreateAlert();
  const updateAlert = settings.useUpdateAlert();
  const firstFree = PAM_EVENT_TYPES.find((event) => !used.includes(event)) ?? PAM_EVENT_TYPES[0];
  const form = useForm<TForm>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: alert
      ? {
          eventType: alert.eventType as AlertEventType,
          name: alert.name,
          description: alert.description ?? "",
          enabled: alert.enabled,
          channels: alert.channels.map(toChannelForm)
        }
      : {
          eventType: firstFree,
          name: DEFAULT_NAMES[firstFree] ?? "",
          description: "",
          enabled: true,
          channels: []
        }
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "channels" });
  const completed = useRef(false);
  const guard = useDiscardChangesGuard({
    isDirty: form.formState.isDirty,
    onDiscard: () => onOpenChange(false)
  });

  const onComplete = async () => {
    const parsed = formSchema.safeParse(form.getValues());
    if (!parsed.success) throw new Error("Fix the highlighted fields, then try again.");
    const { data } = parsed;
    const channels = data.channels.map(toChannelInput);
    if (alert) {
      await updateAlert
        .mutateAsync({
          alertId: alert.id,
          name: data.name,
          description: data.description || null,
          enabled: data.enabled,
          condition: null,
          channels
        })
        .catch(readableFailure("Could not update the alert."));
      saved(`Alert "${data.name}" updated`);
    } else {
      await createAlert
        .mutateAsync({
          name: data.name,
          description: data.description || undefined,
          resourceType: AlertResourceType.PamFolder,
          resourceId: folderId,
          eventType: data.eventType,
          condition: null,
          enabled: data.enabled,
          projectId,
          channels
        })
        .catch(readableFailure("Could not create the alert."));
      saved(`Alert "${data.name}" created`);
    }
    completed.current = true;
  };

  return (
    <FormProvider {...form}>
      <MultiStep
        variant="dialog"
        open={open}
        onOpenChange={(next) => {
          if (next || completed.current) {
            onOpenChange(next);
            return;
          }
          guard.requestDiscard();
        }}
        title={alert ? "Edit alert" : "Create alert"}
        completeLabel={alert ? "Save alert" : "Create alert"}
        onComplete={onComplete}
        steps={[
          {
            title: "Details",
            validate: async () =>
              (await form.trigger(["eventType", "name", "description"])) || false,
            content: <DetailsStep isEditing={Boolean(alert)} used={used} />
          },
          {
            title: "Channels",
            heading: "Notification channels",
            description: "Add at least one destination for this alert.",
            validate: async () => {
              if (!form.getValues("channels").length)
                return { message: "Add at least one channel." };
              return (await form.trigger("channels")) || false;
            },
            content: (
              <ChannelsStep
                projectId={projectId}
                alertId={alert?.id}
                members={members}
                hasEnterprise={hasEnterprise}
                resource={{ resourceType: AlertResourceType.PamFolder, resourceId: folderId }}
                upgrade={{
                  intent: PamEnterpriseAlertingUpgradeIntent,
                  paywallKey: "pam.folder-alert-channels"
                }}
                fieldIds={fields.map((field) => field.id)}
                onAdd={(channelType: AlertChannelType) =>
                  append(buildNextChannel(form.getValues("channels"), channelType))
                }
                onRemove={remove}
              />
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved changes to this alert will be lost."
      />
    </FormProvider>
  );
};

export const FolderAlerts = ({ folderId }: { folderId: string }) => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const settings = useV4Adapter("certManagerSettings");
  const { data: projectId = "" } = useV4Adapter("access").usePamProjectId(orgId);
  const hasEnterprise = useV4Adapter("pamAccess").useHasEnterpriseAlerting(orgId).data ?? false;
  const { data: allAlerts = [], isPending } = settings.useAlerts({
    resourceType: AlertResourceType.PamFolder,
    resourceId: folderId,
    projectId
  });
  const alerts = allAlerts.filter((alert) => alert.resourceId === folderId);
  const updateAlert = settings.useUpdateAlert();
  const deleteAlert = settings.useDeleteAlert();
  const [opened, setOpened] = useState<{ alert?: TAlert; session: number }>({ session: 0 });
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [deleting, setDeleting] = useState<TAlert>();
  const canReadMembers = permission.can(
    OrgPermissionMemberActions.Read,
    OrgPermissionSubjects.Member
  );
  const orgUsers = settings.useAlertOrgUsers(orgId, { enabled: isWizardOpen && canReadMembers });
  const members = toMemberEmails(orgUsers.data);
  const used = alerts.map((alert) => alert.eventType as AlertEventType);
  const allUsed = PAM_EVENT_TYPES.every((event) => used.includes(event));

  const openWizard = (alert?: TAlert) => {
    setOpened((current) => ({ alert, session: current.session + 1 }));
    setIsWizardOpen(true);
  };

  const columns: DataTableColumn<TAlert>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (alert) => alert.name,
      secondary: (alert) => EVENT_LABELS[alert.eventType as AlertEventType] ?? alert.eventType
    },
    {
      id: "channels",
      header: "Channels",
      width: 200,
      render: (alert) =>
        [
          ...new Set(
            alert.channels.filter(({ enabled }) => enabled).map(({ channelType }) => channelType)
          )
        ]
          .map((type) => ALERT_CHANNEL_TYPE_LABELS[type])
          .join(", ") || "None"
    },
    {
      id: "status",
      header: "Status",
      width: 112,
      render: (alert) => (
        <Badge tone={alert.enabled ? "ok" : "outline"} dot>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      )
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush={isPending || alerts.length > 0}
        title="Alerts"
        hint="Notify email, Slack, webhook or PagerDuty about access requests in this folder."
        action={
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            disabledReason={allUsed ? "Every event already has an alert" : undefined}
            onClick={() => openWizard()}
          >
            Add alert
          </Button>
        }
      >
        {isPending || alerts.length > 0 ? (
          <DataTable
            label="Folder alerts"
            rows={alerts}
            columns={columns}
            loading={isPending}
            loadingRows={2}
            getRowId={(alert) => alert.id}
            rowLabel={(alert) => alert.name}
            onRowActivate={openWizard}
            rowActions={{
              inline: [{ label: "Edit", icon: "settings", onSelect: (alert) => openWizard(alert) }],
              renderMenu: (alert) => (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      updateAlert
                        .mutateAsync({ alertId: alert.id, enabled: !alert.enabled })
                        .then(() => saved(`Alert ${alert.enabled ? "disabled" : "enabled"}`))
                        .catch((error) => failed("Failed to update the alert", error))
                    }
                  >
                    <Icon name={alert.enabled ? "pause" : "check"} />
                    {alert.enabled ? "Disable" : "Enable"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(alert)}>
                    <Icon name="trash" />
                    Delete
                  </DropdownMenuItem>
                </>
              )
            }}
          />
        ) : (
          <EmptyState size="sm" media="bare" icon="bell" title="No alerts" />
        )}
      </Card>
      {opened.session > 0 && (!canReadMembers || !orgUsers.isPending) && (
        <AlertWizard
          key={opened.session}
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          alert={opened.alert}
          folderId={folderId}
          projectId={projectId}
          used={used.filter((event) => event !== opened.alert?.eventType)}
          members={members}
          hasEnterprise={hasEnterprise}
        />
      )}
      <ConfirmAction
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "alert"}?`}
        description="The alert and its channels are deleted, and it stops sending notifications."
        confirmText="delete"
        action="Delete alert"
        onConfirm={async () => {
          if (!deleting) return false;
          try {
            await deleteAlert.mutateAsync({ alertId: deleting.id });
            saved(`Alert "${deleting.name}" deleted`);
            return true;
          } catch (error) {
            failed("Failed to delete the alert", error);
            return false;
          }
        }}
      />
    </>
  );
};
