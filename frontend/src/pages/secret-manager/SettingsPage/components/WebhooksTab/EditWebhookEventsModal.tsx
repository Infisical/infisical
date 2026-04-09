import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Webhook Events</DialogTitle>
          <DialogDescription>Select which events should trigger this webhook.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave}>
          <div className="space-y-4">
            {WEBHOOK_EVENTS.map((event) => {
              const { key, label, description } = WEBHOOK_EVENT_METADATA[event];
              const checkboxId = `webhook-event-${event}`;

              return (
                <label key={event} htmlFor={checkboxId} className="flex items-start gap-3">
                  <Checkbox
                    id={checkboxId}
                    isChecked={eventSettings[key]}
                    onCheckedChange={(checked) => handleToggle(key, checked === true)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-accent">{description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" isDisabled={isSubmitting} isPending={isSubmitting}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
