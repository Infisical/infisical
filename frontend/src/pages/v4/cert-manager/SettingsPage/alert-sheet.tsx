import { useRef } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { MultiStep } from "@app/components/v4/ui/multi-step";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { Heading, SmallText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  type AlertChannelType,
  type TAlert,
  type TCertificateAlertEventType
} from "@app/hooks/api/alerts/types";
import { toChannelInput } from "@app/hooks/api/alerts/utils";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ChannelsStep } from "./alert-channels";
import { FiltersStep } from "./alert-filters";
import {
  ALERT_EVENT_DESCRIPTIONS,
  ALERT_EVENT_GROUPS,
  ALERT_EVENT_LABELS,
  alertFormSchema,
  buildNextChannel,
  CertificateFilterKind,
  DETAILS_FIELDS,
  describeChannel,
  emptyAlertForm,
  FILTER_DEFINITIONS,
  formatAlertBefore,
  getAlertResourceType,
  getFilterKinds,
  getFilterName,
  getNoFiltersDescription,
  isExpiryEventType,
  isSignerEventType,
  type TAlertForm,
  type TMemberEmails,
  toAlertForm,
  toApiEventType,
  toCondition
} from "./alert-model";

const OnOff = ({ on, labels = ["Enabled", "Disabled"] }: { on: boolean; labels?: string[] }) => (
  <Badge tone={on ? "ok" : "outline"}>{on ? labels[0] : labels[1]}</Badge>
);

export const AlertReview = ({
  values,
  members
}: {
  values: TAlertForm;
  members: TMemberEmails;
}) => {
  const isExpiry = isExpiryEventType(values.eventType);
  const filterKinds = getFilterKinds(values.eventType);
  const hasFilters = filterKinds.some((kind) => values[kind]?.length);
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <Heading level={4} size="subsection">
          Details
        </Heading>
        <DataList
          variant="props"
          items={[
            ["Name", values.name],
            ["Alert type", ALERT_EVENT_LABELS[values.eventType]],
            ["Status", <OnOff key="status" on={values.enabled} />],
            ...(isExpiry
              ? ([
                  ["Alert before", formatAlertBefore(values.alertBefore)],
                  [
                    "Repeat daily",
                    <OnOff key="daily" on={values.dailyReminder} labels={["On", "Off"]} />
                  ]
                ] as const)
              : []),
            ...(values.description ? ([["Description", values.description]] as const) : [])
          ]}
        />
      </Stack>
      <Stack gap={8}>
        <Heading level={4} size="subsection">
          {isSignerEventType(values.eventType) ? "Signer filters" : "Certificate filters"}
        </Heading>
        {hasFilters ? (
          <DataList
            variant="props"
            items={filterKinds.map((kind) => {
              const ids = values[kind] ?? [];
              return [
                FILTER_DEFINITIONS[kind].label,
                ids.length ? (
                  <Inline key={kind} gap={4} wrap>
                    {ids.map((id) => (
                      <Badge key={id} tone="soft">
                        {getFilterName(kind, id, values.conditionNames)}
                      </Badge>
                    ))}
                  </Inline>
                ) : (
                  FILTER_DEFINITIONS[kind].allLabel
                )
              ] as const;
            })}
          />
        ) : (
          <SmallText muted>{getNoFiltersDescription(values.eventType)}</SmallText>
        )}
      </Stack>
      <Stack gap={8}>
        <Heading level={4} size="subsection">
          Notification channels
        </Heading>
        <DataList
          variant="props"
          items={values.channels.map(
            (channel, index) =>
              [
                ALERT_CHANNEL_TYPE_LABELS[channel.channelType],
                <Inline
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${channel.channelType}-${index}`}
                  gap={8}
                  align="center"
                  justify="between"
                  wrap={false}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {describeChannel(channel, members)}
                  </span>
                  <OnOff on={channel.enabled} />
                </Inline>
              ] as const
          )}
        />
      </Stack>
    </Stack>
  );
};

const DetailsStep = ({ isEditing }: { isEditing: boolean }) => {
  const { control, register, setValue, formState } = useFormContext<TAlertForm>();
  const [eventType, dailyReminder] = useWatch({ control, name: ["eventType", "dailyReminder"] });
  const { errors } = formState;
  return (
    <Stack gap={16}>
      <Field wide label="Alert type" description={ALERT_EVENT_DESCRIPTIONS[eventType]}>
        <Select
          label="Alert type"
          value={eventType}
          disabled={isEditing}
          options={ALERT_EVENT_GROUPS.flatMap((group) =>
            group.events.map((event) => ({
              value: event,
              label: ALERT_EVENT_LABELS[event],
              group: group.label
            }))
          )}
          onChange={(value) => {
            const next = value as TCertificateAlertEventType;
            setValue("eventType", next, { shouldDirty: true });
            const nextKinds = getFilterKinds(next);
            Object.values(CertificateFilterKind)
              .filter((kind) => !nextKinds.includes(kind))
              .forEach((kind) => setValue(kind, undefined, { shouldDirty: true }));
          }}
        />
      </Field>
      <Field wide label="Name" error={errors.name?.message}>
        <Input
          {...register("name")}
          placeholder="tls-expiry-alert"
          invalid={Boolean(errors.name)}
          autoComplete="off"
        />
      </Field>
      <Field wide label="Description" optional error={errors.description?.message}>
        <Textarea
          {...register("description")}
          rows={3}
          aria-invalid={Boolean(errors.description) || undefined}
        />
      </Field>
      {isExpiryEventType(eventType) && (
        <>
          <Field
            wide
            label="Alert before"
            description="A number and a unit: d for days, w for weeks, m for months or y for years."
            error={errors.alertBefore?.message}
          >
            <Input
              {...register("alertBefore")}
              mono
              placeholder="30d"
              invalid={Boolean(errors.alertBefore)}
              autoComplete="off"
            />
          </Field>
          <Switch
            layout="row"
            label="Repeat daily until expiry"
            description="Sends a reminder every day from the alert threshold until the certificate expires."
            checked={dailyReminder}
            onCheckedChange={(checked) => setValue("dailyReminder", checked, { shouldDirty: true })}
          />
        </>
      )}
    </Stack>
  );
};

type WizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alert?: TAlert;
  projectId: string;
  members: TMemberEmails;
  hasEnterprise: boolean;
};

export const AlertWizard = ({
  open,
  onOpenChange,
  alert,
  projectId,
  members,
  hasEnterprise
}: WizardProps) => {
  const settings = useV4Adapter("certManagerSettings");
  const createAlert = settings.useCreateAlert();
  const updateAlert = settings.useUpdateAlert();
  const form = useForm<TAlertForm>({
    resolver: zodResolver(alertFormSchema),
    mode: "onChange",
    defaultValues: alert ? toAlertForm(alert, members) : emptyAlertForm()
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "channels" });
  const eventType = useWatch({ control: form.control, name: "eventType" });
  const values = useWatch({ control: form.control }) as TAlertForm;
  const completed = useRef(false);
  const guard = useDiscardChangesGuard({
    isDirty: form.formState.isDirty,
    onDiscard: () => onOpenChange(false)
  });
  const isSignerEvent = isSignerEventType(eventType);

  const onComplete = async () => {
    const parsed = alertFormSchema.safeParse(form.getValues());
    if (!parsed.success) throw new Error("Fix the highlighted fields, then try again.");
    const { data } = parsed;
    const channels = data.channels.map(toChannelInput);
    const condition = toCondition(data);
    if (alert) {
      await updateAlert.mutateAsync({
        alertId: alert.id,
        name: data.name,
        description: data.description || null,
        enabled: data.enabled,
        condition,
        channels
      });
      saved(`Alert "${data.name}" updated`);
    } else {
      await createAlert.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        resourceType: getAlertResourceType(data.eventType),
        resourceId: null,
        eventType: toApiEventType(data.eventType),
        condition,
        enabled: data.enabled,
        projectId,
        channels
      });
      saved(`Alert "${data.name}" created`);
    }
    completed.current = true;
  };

  return (
    <FormProvider {...form}>
      <MultiStep
        variant="sheet"
        size="lg"
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
            summary: ALERT_EVENT_LABELS[eventType],
            validate: async () => (await form.trigger(DETAILS_FIELDS)) || false,
            content: <DetailsStep isEditing={Boolean(alert)} />
          },
          {
            title: "Filters",
            heading: isSignerEvent ? "Signer filters" : "Certificate filters",
            description: isSignerEvent
              ? "Narrow which signers this alert covers, or leave it on every active signer."
              : "Narrow which certificates this alert covers, or leave it on every certificate.",
            validate: async () =>
              (await form.trigger(Object.values(CertificateFilterKind))) || false,
            content: <FiltersStep projectId={projectId} />
          },
          {
            title: "Channels",
            heading: "Notification channels",
            description: "Add at least one destination for this alert.",
            validate: async () => {
              if (!form.getValues("channels").length) return "Add at least one channel.";
              return (await form.trigger("channels")) || false;
            },
            content: (
              <ChannelsStep
                projectId={projectId}
                alertId={alert?.id}
                members={members}
                hasEnterprise={hasEnterprise}
                fieldIds={fields.map((field) => field.id)}
                onAdd={(channelType: AlertChannelType) =>
                  append(buildNextChannel(form.getValues("channels"), channelType))
                }
                onRemove={remove}
              />
            )
          },
          {
            title: "Review",
            content: <AlertReview values={values} members={members} />
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

export const AlertDetailsSheet = ({
  alert,
  members,
  onClose
}: {
  alert?: TAlert;
  members: TMemberEmails;
  onClose: () => void;
}) => (
  <Sheet open={Boolean(alert)} onOpenChange={(next) => !next && onClose()}>
    <SheetContent size="lg">
      <SheetHeader>
        <SheetTitle>{alert?.name ?? "Alert details"}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        {alert && <AlertReview values={toAlertForm(alert, members)} members={members} />}
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
