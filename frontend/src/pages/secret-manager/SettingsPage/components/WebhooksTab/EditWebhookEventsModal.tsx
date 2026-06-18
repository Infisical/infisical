import { FormEvent, useEffect, useMemo, useState } from "react";
import { components, OptionProps } from "react-select";
import { CheckIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  TWebhook,
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS,
  WebhookEvent
} from "@app/hooks/api/webhooks/types";

type TWebhookEventSettings = Record<WebhookEvent, boolean>;
type TWebhookEventOption = {
  value: WebhookEvent;
  label: string;
  description: string;
};

type Props = {
  isOpen?: boolean;
  webhook?: TWebhook;
  isSubmitting?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (settings: TWebhookEventSettings) => Promise<void>;
};

const EVENT_OPTIONS: TWebhookEventOption[] = WEBHOOK_EVENTS.map((event) => ({
  value: event,
  label: WEBHOOK_EVENT_METADATA[event].label,
  description: WEBHOOK_EVENT_METADATA[event].description
}));

const OptionWithDescription = (props: OptionProps<TWebhookEventOption>) => {
  const { data, children, isSelected } = props;

  return (
    <components.Option {...props}>
      <div className="flex flex-row items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{children}</p>
          <p className="truncate text-xs leading-4 text-muted">{data.description}</p>
        </div>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

const buildAllEnabled = (): TWebhookEventSettings =>
  WEBHOOK_EVENTS.reduce<TWebhookEventSettings>((acc, event) => {
    acc[event] = true;
    return acc;
  }, {} as TWebhookEventSettings);

const buildAllDisabled = (): TWebhookEventSettings =>
  WEBHOOK_EVENTS.reduce<TWebhookEventSettings>((acc, event) => {
    acc[event] = false;
    return acc;
  }, {} as TWebhookEventSettings);

export const EditWebhookEventsModal = ({
  isOpen,
  webhook,
  isSubmitting,
  onOpenChange,
  onSave
}: Props) => {
  const defaultSettings = useMemo<TWebhookEventSettings>(
    () => ({
      [WebhookEvent.SecretModified]: true,
      [WebhookEvent.SecretRotationFailed]: true,
      [WebhookEvent.HoneyTokenTriggered]: true
    }),
    []
  );
  const [eventSettings, setEventSettings] = useState<TWebhookEventSettings>(defaultSettings);

  useEffect(() => {
    if (!isOpen) return;

    if (!webhook) {
      setEventSettings(defaultSettings);
      return;
    }

    if (webhook.eventsFilter.length === 0) {
      setEventSettings(buildAllEnabled());
      return;
    }

    const filteredEventNames = new Set(webhook.eventsFilter.map((e) => e.eventName));
    setEventSettings(
      WEBHOOK_EVENTS.reduce<TWebhookEventSettings>((acc, event) => {
        acc[event] = filteredEventNames.has(event);
        return acc;
      }, {} as TWebhookEventSettings)
    );
  }, [isOpen, webhook, defaultSettings]);

  const selectedOptions = useMemo(
    () => EVENT_OPTIONS.filter((option) => eventSettings[option.value]),
    [eventSettings]
  );

  const hasSelection = selectedOptions.length > 0;

  const handleChange = (selected: readonly TWebhookEventOption[]) => {
    const next = buildAllDisabled();
    selected.forEach((option) => {
      next[option.value] = true;
    });
    setEventSettings(next);
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSave(eventSettings);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Webhook Events</DialogTitle>
          <DialogDescription>Select which events should trigger this webhook.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <Field>
            <FieldLabel htmlFor="webhook-events">Events</FieldLabel>
            <FilterableSelect
              isMulti
              inputId="webhook-events"
              options={EVENT_OPTIONS}
              value={selectedOptions}
              onChange={(selected) => handleChange(selected as readonly TWebhookEventOption[])}
              getOptionValue={(option) => option.value}
              getOptionLabel={(option) => option.label}
              placeholder="Select events..."
              menuPlacement="bottom"
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{ Option: OptionWithDescription }}
            />
            {!hasSelection && (
              <FieldDescription>
                No events selected. The webhook will trigger on all events by default.
              </FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
