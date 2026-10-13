import { useFormContext, useWatch } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import {
  isWebhookUrlChanged,
  TChannelsForm,
  WEBHOOK_AUTH_FIELDS,
  WebhookAuthType
} from "@app/hooks/api/alerts";

import { ChannelSecretInput, KEEP_PLACEHOLDER } from "./ChannelSecretInput";

const NO_AUTH = "none";

const REENTER_PLACEHOLDER = "Re-enter for new URL";

type Props = {
  index: number;
};

export const WebhookAuthenticationField = ({ index }: Props) => {
  const {
    control,
    register,
    setValue,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const channel = useWatch({ control, name: `channels.${index}` });
  const channelErrors = errors.channels?.[index];
  const isUrlChanged = isWebhookUrlChanged(channel);

  return (
    <Field>
      <FieldLabel>Authentication</FieldLabel>
      <FieldContent>
        <Tabs
          value={channel?.authType ?? NO_AUTH}
          onValueChange={(value) =>
            setValue(
              `channels.${index}.authType`,
              value === NO_AUTH ? undefined : (value as WebhookAuthType),
              { shouldDirty: true }
            )
          }
        >
          <TabsList variant="filled" aria-label="Authentication type" className="w-full">
            <TabsTrigger value={NO_AUTH}>None</TabsTrigger>
            {Object.values(WebhookAuthType).map((type) => (
              <TabsTrigger key={type} value={type}>
                {WEBHOOK_AUTH_FIELDS[type].label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={NO_AUTH} className="mt-0">
            <FieldDescription>Requests are sent without authentication.</FieldDescription>
          </TabsContent>
          {Object.values(WebhookAuthType).map((type) => {
            const { description, name, secret } = WEBHOOK_AUTH_FIELDS[type];
            const hasSavedSecret = Boolean(channel?.id && channel[secret.hasSaved]);
            const needsReentry = hasSavedSecret && isUrlChanged;
            let secretPlaceholder = secret.label;
            if (hasSavedSecret)
              secretPlaceholder = needsReentry ? REENTER_PLACEHOLDER : KEEP_PLACEHOLDER;

            return (
              <TabsContent key={type} value={type} className="@container mt-0 flex flex-col gap-2">
                <div className="flex flex-col gap-2 @md:flex-row @md:items-start">
                  {name && (
                    <Field
                      className={
                        type === WebhookAuthType.Basic ? "min-w-0 @md:flex-1" : "@md:w-2/5"
                      }
                    >
                      <Input
                        aria-label={name.label}
                        placeholder={name.placeholder}
                        isError={Boolean(channelErrors?.[name.field])}
                        {...register(`channels.${index}.${name.field}`)}
                      />
                      <FieldError errors={[channelErrors?.[name.field]]} />
                    </Field>
                  )}
                  <Field className="min-w-0 @md:flex-1">
                    <ChannelSecretInput
                      id={`channel-${index}-${secret.field}`}
                      ariaLabel={secret.label}
                      placeholder={secretPlaceholder}
                      isError={Boolean(channelErrors?.[secret.field])}
                      isWarning={needsReentry && !channel[secret.field]}
                      registration={register(`channels.${index}.${secret.field}`)}
                    />
                    <FieldError errors={[channelErrors?.[secret.field]]} />
                  </Field>
                </div>
                <FieldDescription>{description}</FieldDescription>
              </TabsContent>
            );
          })}
        </Tabs>
      </FieldContent>
    </Field>
  );
};
