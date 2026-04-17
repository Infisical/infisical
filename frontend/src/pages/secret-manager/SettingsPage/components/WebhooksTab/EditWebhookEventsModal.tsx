import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { components, OptionProps } from "react-select";
import { CheckIcon } from "lucide-react";

import { Button, FilterableSelect, FormControl, Modal, ModalContent } from "@app/components/v2";
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
          <p className="truncate text-xs leading-4 text-mineshaft-400">{data.description}</p>
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
      [WebhookEvent.SecretRotationFailed]: true
    }),
    []
  );
  const [eventSettings, setEventSettings] = useState<TWebhookEventSettings>(defaultSettings);
  const modalContainer = useRef<HTMLDivElement>(null);

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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        ref={modalContainer}
        title="Edit Webhook Events"
        subTitle="Select which events should trigger this webhook."
      >
        <form onSubmit={handleSave}>
          <FormControl
            label="Events"
            helperText={
              !hasSelection
                ? "No events selected. The webhook will trigger on all events by default."
                : undefined
            }
          >
            <FilterableSelect
              isMulti
              options={EVENT_OPTIONS}
              value={selectedOptions}
              onChange={(selected) => handleChange(selected as readonly TWebhookEventOption[])}
              getOptionValue={(option) => option.value}
              getOptionLabel={(option) => option.label}
              placeholder="Select events..."
              menuPortalTarget={modalContainer.current}
              menuPlacement="bottom"
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{ Option: OptionWithDescription }}
            />
          </FormControl>

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
