import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button, Modal, ModalClose, ModalContent, Switch } from "@app/components/v2";
import {
  TWebhook,
  TWebhookEventToggleKey,
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS
} from "@app/hooks/api/webhooks/types";

type TWebhookEventSettings = Record<TWebhookEventToggleKey, boolean>;
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
  const defaultSettings = useMemo(
    () => ({ isSecretModifiedEventEnabled: true, isSecretRotationFailedEventEnabled: true }),
    []
  );
  const [eventSettings, setEventSettings] = useState<TWebhookEventSettings>(defaultSettings);

  useEffect(() => {
    if (!isOpen) return;

    if (!webhook) {
      setEventSettings(defaultSettings);
      return;
    }

    setEventSettings(
      WEBHOOK_EVENTS.reduce<TWebhookEventSettings>((acc, event) => {
        const { key } = WEBHOOK_EVENT_METADATA[event];
        acc[key] = webhook[key] ?? true;
        return acc;
      }, {} as TWebhookEventSettings)
    );
  }, [isOpen, webhook, defaultSettings]);

  const handleToggle = (key: TWebhookEventToggleKey, isEnabled: boolean) => {
    setEventSettings((curr) => ({
      ...curr,
      [key]: isEnabled
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
          <div className="space-y-3">
            {WEBHOOK_EVENTS.map((event) => {
              const { key, label, description } = WEBHOOK_EVENT_METADATA[event];

              return (
                <div
                  key={event}
                  className="flex items-center justify-between rounded-lg border border-mineshaft-600 bg-mineshaft-800 px-4 py-3"
                >
                  <div className="pr-6">
                    <p className="text-sm font-medium text-mineshaft-50">{label}</p>
                    <p className="text-sm text-mineshaft-400">{description}</p>
                  </div>
                  <Switch
                    id={`webhook-event-${event}`}
                    isChecked={eventSettings[key]}
                    onCheckedChange={(checked) => handleToggle(key, checked === true)}
                    thumbClassName="bg-mineshaft-800"
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
            <Button type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
