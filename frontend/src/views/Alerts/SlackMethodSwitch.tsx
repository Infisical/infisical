import { useFormContext, useWatch } from "react-hook-form";

import { Tabs, TabsList, TabsTrigger } from "@app/components/v3";
import { AlertChannelType, TChannelsForm } from "@app/hooks/api/alerts";

import { useChannelPath } from "./channelPath";

const SLACK_METHODS = [
  { channelType: AlertChannelType.SlackApp, label: "Slack app" },
  { channelType: AlertChannelType.Slack, label: "Webhook URL" }
];

type Props = { index: number };

export const SlackMethodSwitch = ({ index }: Props) => {
  const { control, setValue, clearErrors } = useFormContext<TChannelsForm>();
  const channelPath = useChannelPath(index);
  const saved = useWatch({ control, name: `${channelPath}.savedChannel` });
  const channelType = useWatch({ control, name: `${channelPath}.channelType` });

  // A saved channel can't change type, so switching drops its id and the save replaces it with a new one.
  const selectMethod = (nextType: AlertChannelType) => {
    if (nextType === channelType) return;
    const isSavedMethod = saved?.channelType === nextType;
    setValue(`${channelPath}.id`, isSavedMethod ? saved.id : undefined, { shouldDirty: true });
    setValue(`${channelPath}.hasWebhookUrl`, isSavedMethod ? saved.hasWebhookUrl : false);
    setValue(`${channelPath}.channelType`, nextType, { shouldDirty: true });
    clearErrors(`${channelPath}`);
  };

  const isReplacingSaved = Boolean(saved) && saved?.channelType !== channelType;

  return (
    <div className="flex flex-col gap-1.5">
      <Tabs value={channelType} onValueChange={(value) => selectMethod(value as AlertChannelType)}>
        <TabsList variant="filled" aria-label="How to post to Slack">
          {SLACK_METHODS.map((method) => (
            <TabsTrigger key={method.channelType} value={method.channelType}>
              {method.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isReplacingSaved && (
        <p className="text-xs text-muted">
          Saving the alert replaces this Slack channel with a new one.
        </p>
      )}
    </div>
  );
};
