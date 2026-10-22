import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel
} from "@app/components/v3";
import {
  DEFAULT_ENABLED_EVENTS,
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

const renderEventOption = (option: TWebhookEventOption) => (
  <div className="min-w-0">
    <p className="truncate font-medium">{option.label}</p>
    <p className="truncate text-xs leading-4 text-muted">{option.description}</p>
  </div>
);

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
  const defaultSettings = DEFAULT_ENABLED_EVENTS;
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
            <Combobox
              multiple
              id="webhook-events"
              options={EVENT_OPTIONS}
              value={selectedOptions}
              onValueChange={handleChange}
              getOptionValue={(option) => option.value}
              getOptionKeywords={(option) => [option.value]}
              getOptionLabel={(option) => option.label}
              placeholder="Select events..."
              renderOption={renderEventOption}
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
