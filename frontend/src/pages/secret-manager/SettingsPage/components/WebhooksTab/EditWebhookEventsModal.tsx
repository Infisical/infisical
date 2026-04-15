import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button, Checkbox, Modal, ModalContent } from "@app/components/v2";
import {
  TWebhook,
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS,
  WebhookEvent
} from "@app/hooks/api/webhooks/types";

type TWebhookEventSettings = Record<WebhookEvent, boolean>;
type Props = {
  isOpen?: boolean;
  webhook?: TWebhook;
  isSubmitting?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (settings: TWebhookEventSettings) => Promise<void>;
};

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
      [WebhookEvent.SecretRotationFailed]: true
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

    // eventsFilter is the blocklist — an event is enabled when it is NOT in the filter.
    const filteredEventNames = new Set(webhook.eventsFilter.map((e) => e.eventName));
    setEventSettings(
      WEBHOOK_EVENTS.reduce<TWebhookEventSettings>((acc, event) => {
        acc[event] = !filteredEventNames.has(event);
        return acc;
      }, {} as TWebhookEventSettings)
    );
  }, [isOpen, webhook, defaultSettings]);

  const handleToggle = (event: WebhookEvent, isEnabled: boolean) => {
    setEventSettings((curr) => ({
      ...curr,
      [event]: isEnabled
    }));
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSave(eventSettings);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit Webhook Events"
        subTitle="Select which events should trigger this webhook."
      >
        <form onSubmit={handleSave}>
          <div className="space-y-4">
            {WEBHOOK_EVENTS.map((event) => {
              const { label, description } = WEBHOOK_EVENT_METADATA[event];

              return (
                <Checkbox
                  key={event}
                  id={`webhook-event-${event}`}
                  isChecked={eventSettings[event]}
                  onCheckedChange={(checked) => handleToggle(event, checked === true)}
                  allowMultilineLabel
                >
                  <p className="font-medium text-mineshaft-50">{label}</p>
                  <p className="text-mineshaft-400">{description}</p>
                </Checkbox>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-end space-x-4">
            <Button
              type="button"
              variant="plain"
              colorSchema="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
