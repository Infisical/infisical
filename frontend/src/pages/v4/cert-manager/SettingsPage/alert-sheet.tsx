import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Heading, SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  ALERT_CHANNEL_TYPE_LABELS,
  type TAlert,
  type TCertificateAlertEventType
} from "@app/hooks/api/alerts/types";
import { toChannelInput } from "@app/hooks/api/alerts/utils";

import { readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ChannelsStep } from "./alert-channels";
import { FiltersStep } from "./alert-filters";
import {
  ALERT_EVENT_DESCRIPTIONS,
  ALERT_EVENT_GROUPS,
  ALERT_EVENT_LABELS,
  alertFormSchema,
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
  type TAlertDraft,
  type TAlertForm,
  type TFieldErrors,
  type TMemberEmails,
  toAlertDraft,
  toAlertForm,
  toApiEventType,
  toCondition,
  toFieldErrors,
  validateChannels,
  withoutErrors
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
            (channel) =>
              [
                ALERT_CHANNEL_TYPE_LABELS[channel.channelType],
                <Inline key={channel.name} gap={8} align="center" justify="between" wrap={false}>
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

const DetailsStep = ({
  isEditing,
  draft,
  errors,
  onChange
}: {
  isEditing: boolean;
  draft: TAlertDraft;
  errors: TFieldErrors;
  onChange: (patch: Partial<TAlertDraft>) => void;
}) => {
  const { eventType, dailyReminder } = draft;
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
            const nextKinds = new Set(getFilterKinds(next));
            onChange({
              eventType: next,
              ...Object.fromEntries(
                Object.values(CertificateFilterKind)
                  .filter((kind) => !nextKinds.has(kind))
                  .map((kind) => [kind, undefined])
              )
            });
          }}
        />
      </Field>
      <Field wide label="Name" error={errors.name}>
        <Input
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="tls-expiry-alert"
          invalid={Boolean(errors.name)}
          autoComplete="off"
        />
      </Field>
      <Field wide label="Description" optional error={errors.description}>
        <Textarea
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
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
            error={errors.alertBefore}
          >
            <Input
              value={draft.alertBefore}
              onChange={(event) => onChange({ alertBefore: event.target.value })}
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
            onCheckedChange={(checked) => onChange({ dailyReminder: checked })}
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
  const [initial] = useState(() =>
    toAlertDraft(alert ? toAlertForm(alert, members) : emptyAlertForm())
  );
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<TFieldErrors>({});
  const [channelErrors, setChannelErrors] = useState<TFieldErrors>({});
  const completed = useRef(false);
  const guard = useDiscardChangesGuard({
    isDirty: JSON.stringify(draft) !== JSON.stringify(initial),
    onDiscard: () => onOpenChange(false)
  });
  const { eventType } = draft;
  const isSignerEvent = isSignerEventType(eventType);

  const update = (patch: Partial<TAlertDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) =>
      Object.keys(patch).reduce((next, key) => withoutErrors(next, key), current)
    );
  };

  const validateFields = (keys: string[]) => {
    const result = alertFormSchema.safeParse(draft);
    const next = toFieldErrors(result.success ? undefined : result.error, ([key]) =>
      keys.includes(String(key))
    );
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onComplete = async () => {
    const parsed = alertFormSchema.safeParse(draft);
    if (!parsed.success) throw new Error("Fix the highlighted fields, then try again.");
    const { data } = parsed;
    const channels = data.channels.map(toChannelInput);
    const condition = toCondition(data);
    if (alert) {
      await updateAlert
        .mutateAsync({
          alertId: alert.id,
          name: data.name,
          description: data.description || null,
          enabled: data.enabled,
          condition,
          channels
        })
        .catch(readableFailure("Could not update the alert."));
      saved(`Alert "${data.name}" updated`);
    } else {
      await createAlert
        .mutateAsync({
          name: data.name,
          description: data.description || undefined,
          resourceType: getAlertResourceType(data.eventType),
          resourceId: null,
          eventType: toApiEventType(data.eventType),
          condition,
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
    <>
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
            validate: () => validateFields(DETAILS_FIELDS),
            content: (
              <DetailsStep
                isEditing={Boolean(alert)}
                draft={draft}
                errors={errors}
                onChange={update}
              />
            )
          },
          {
            title: "Filters",
            heading: isSignerEvent ? "Signer filters" : "Certificate filters",
            description: isSignerEvent
              ? "Narrow which signers this alert covers, or leave it on every active signer."
              : "Narrow which certificates this alert covers, or leave it on every certificate.",
            validate: () => validateFields(Object.values(CertificateFilterKind)),
            content: (
              <FiltersStep projectId={projectId} draft={draft} errors={errors} onChange={update} />
            )
          },
          {
            title: "Channels",
            heading: "Notification channels",
            description: "Add at least one destination for this alert.",
            validate: () => {
              if (!draft.channels.length) return { message: "Add at least one channel." };
              const next = validateChannels(draft.channels);
              setChannelErrors(next);
              return Object.keys(next).length === 0;
            },
            content: (
              <ChannelsStep
                channels={draft.channels}
                errors={channelErrors}
                onChange={(channels) => setDraft((current) => ({ ...current, channels }))}
                onErrorsChange={setChannelErrors}
                projectId={projectId}
                alertId={alert?.id}
                members={members}
                hasEnterprise={hasEnterprise}
                resource={{ resourceType: getAlertResourceType(eventType), resourceId: null }}
              />
            )
          },
          {
            title: "Review",
            content: <AlertReview values={draft} members={members} />
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved changes to this alert will be lost."
      />
    </>
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
