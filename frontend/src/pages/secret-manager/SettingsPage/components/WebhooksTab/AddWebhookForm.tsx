import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import {
  TWebhookEventToggleKey,
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS,
  WebhookType
} from "@app/hooks/api/webhooks/types";

const formSchema = z
  .object({
    environment: z.string().trim().describe("Environment"),
    webhookUrl: z.string().url().trim().describe("Webhook URL"),
    webhookSecretKey: z.string().trim().optional().describe("Secret Key"),
    secretPath: z.string().trim().describe("Secret Path"),
    type: z.nativeEnum(WebhookType).describe("Type").default(WebhookType.GENERAL),
    isSecretModifiedEventEnabled: z.boolean().default(true),
    isSecretRotationFailedEventEnabled: z.boolean().default(true)
  })
  .superRefine((data, ctx) => {
    if (data.type === WebhookType.SLACK && !data.webhookUrl.includes("hooks.slack.com")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incoming Webhook URL is invalid.",
        path: ["webhookUrl"]
      });
    }
  });

export type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreateWebhook: (data: TFormSchema) => void;
  environments?: Array<{ slug: string; name: string }>;
};

export const AddWebhookForm = ({
  isOpen,
  onOpenChange,
  onCreateWebhook,
  environments = []
}: Props) => {
  const {
    control,
    handleSubmit,
    register,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: WebhookType.GENERAL,
      isSecretModifiedEventEnabled: true,
      isSecretRotationFailedEventEnabled: true
    }
  });

  const selectedWebhookType = watch("type");
  const selectedEnvironment = watch("environment");

  const generalFormFields = (
    <>
      <FormControl
        label="Secret Key"
        isError={Boolean(errors?.webhookSecretKey)}
        errorText={errors?.webhookSecretKey?.message}
        helperText="To generate webhook signature for verification"
      >
        <Input placeholder="Provided during webhook setup" {...register("webhookSecretKey")} />
      </FormControl>
      <FormControl
        label="Webhook URL"
        isRequired
        isError={Boolean(errors?.webhookUrl)}
        errorText={errors?.webhookUrl?.message}
      >
        <Input {...register("webhookUrl")} />
      </FormControl>
    </>
  );

  const slackFormFields = (
    <FormControl
      label="Incoming Webhook URL"
      isRequired
      isError={Boolean(errors?.webhookUrl)}
      errorText={errors?.webhookUrl?.message}
    >
      <Input placeholder="https://hooks.slack.com/services/..." {...register("webhookUrl")} />
    </FormControl>
  );

  const microsoftTeamsFormFields = (
    <FormControl
      label="Incoming Webhook URL"
      isRequired
      isError={Boolean(errors?.webhookUrl)}
      errorText={errors?.webhookUrl?.message}
    >
      <Input
        placeholder="https://<tenant>.webhook.office.com/webhookb2/..."
        {...register("webhookUrl")}
      />
    </FormControl>
  );

  const renderFormFields = () => {
    switch (selectedWebhookType) {
      case WebhookType.SLACK:
        return slackFormFields;
      case WebhookType.MICROSOFT_TEAMS:
        return microsoftTeamsFormFields;
      default:
        return generalFormFields;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Create a new webhook">
        <form onSubmit={handleSubmit(onCreateWebhook)}>
          <div>
            <Controller
              control={control}
              name="type"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Type"
                  isRequired
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    <SelectItem value={WebhookType.GENERAL} key={WebhookType.GENERAL}>
                      General
                    </SelectItem>
                    <SelectItem value={WebhookType.SLACK} key={WebhookType.SLACK}>
                      Slack
                    </SelectItem>
                    <SelectItem
                      value={WebhookType.MICROSOFT_TEAMS}
                      key={WebhookType.MICROSOFT_TEAMS}
                    >
                      Microsoft Teams
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="environment"
              defaultValue={environments?.[0]?.slug}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Environment"
                  isRequired
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {environments.map(({ name, slug }) => (
                      <SelectItem value={slug} key={slug}>
                        {name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="secretPath"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Path"
                  isRequired
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <SecretPathInput {...field} environment={selectedEnvironment} placeholder="/" />
                </FormControl>
              )}
            />
            {selectedWebhookType === WebhookType.SLACK ? slackFormFields : generalFormFields}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced-settings" className="data-[state=open]:border-none">
                <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
                  <div className="order-1 ml-3">Advanced Settings</div>
                </AccordionTrigger>
                <AccordionContent childrenClassName="p-0 pt-2">
                  <p className="mb-4 text-sm text-mineshaft-400">
                    Select which events will trigger this webhook
                  </p>
                  <div className="space-y-4">
                    {WEBHOOK_EVENTS.map((event) => {
                      const { key, label, description } = WEBHOOK_EVENT_METADATA[event];

                      return (
                        <Controller
                          key={event}
                          control={control}
                          name={key as TWebhookEventToggleKey}
                          render={({ field: { value, onChange } }) => (
                            <Checkbox
                              id={`webhook-event-${event}`}
                              isChecked={value}
                              onCheckedChange={(checked) => onChange(checked === true)}
                              allowMultilineLabel
                            >
                              <p className="font-medium text-mineshaft-50">{label}</p>
                              <p className="text-mineshaft-400">{description}</p>
                            </Checkbox>
                          )}
                        />
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <div className="mt-8 flex items-center justify-end">
            <Button type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
              Create webhook
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
