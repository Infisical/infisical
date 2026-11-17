import { useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Button, ButtonGroup } from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { AlertChannelType, TChannelsForm } from "@app/hooks/api/alerts";

const SLACK_METHODS = [
  { channelType: AlertChannelType.SlackApp, label: "Slack app" },
  { channelType: AlertChannelType.Slack, label: "Incoming webhook" }
];

type Props = { index: number };

export const SlackMethodSwitch = ({ index }: Props) => {
  const scopeVariant = useScopeVariant();
  const { control, getValues, setValue, clearErrors } = useFormContext<TChannelsForm>();
  const savedChannel = useRef(getValues(`channels.${index}`));
  const channelType = useWatch({ control, name: `channels.${index}.channelType` });

  // A saved channel can't change type, so switching drops its id and the save replaces it with a new one.
  const selectMethod = (nextType: AlertChannelType) => {
    if (nextType === channelType) return;
    const saved = savedChannel.current;
    const isSavedMethod = Boolean(saved?.id) && saved.channelType === nextType;
    setValue(`channels.${index}.id`, isSavedMethod ? saved.id : undefined, { shouldDirty: true });
    setValue(`channels.${index}.hasWebhookUrl`, isSavedMethod ? saved.hasWebhookUrl : false);
    setValue(`channels.${index}.channelType`, nextType, { shouldDirty: true });
    clearErrors(`channels.${index}`);
  };

  const isReplacingSaved =
    Boolean(savedChannel.current?.id) && savedChannel.current.channelType !== channelType;

  return (
    <div className="flex flex-col gap-1.5">
      <ButtonGroup aria-label="How to post to Slack">
        {SLACK_METHODS.map((method) => (
          <Button
            key={method.channelType}
            type="button"
            size="xs"
            variant={channelType === method.channelType ? scopeVariant : "outline"}
            aria-pressed={channelType === method.channelType}
            onClick={() => selectMethod(method.channelType)}
          >
            {method.label}
          </Button>
        ))}
      </ButtonGroup>
      {isReplacingSaved && (
        <p className="text-xs text-muted">
          Saving the alert replaces this Slack channel with a new one.
        </p>
      )}
    </div>
  );
};
