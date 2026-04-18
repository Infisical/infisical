import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { components, OptionProps } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "lucide-react";
import z from "zod";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import {
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS,
  WebhookEvent,
  WebhookType
} from "@app/hooks/api/webhooks/types";

type TWebhookEventOption = {
  value: WebhookEvent;
  label: string;
  description: string;
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

const formSchema = z
  .object({
    environment: z.string().trim().describe("Environment"),
    webhookUrl: z.string().url().trim().describe("Webhook URL"),
    webhookSecretKey: z.string().trim().optional().describe("Secret Key"),
    secretPath: z.string().trim().describe("Secret Path"),
    type: z.nativeEnum(WebhookType).describe("Type").default(WebhookType.GENERAL),
    enabledEvents: z.record(z.nativeEnum(WebhookEvent), z.boolean()).default({
      [WebhookEvent.SecretModified]: true,
      [WebhookEvent.SecretRotationFailed]: true
    })
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
      enabledEvents: {
        [WebhookEvent.SecretModified]: true,
        [WebhookEvent.SecretRotationFailed]: true
      }
    }
  });

  const selectedWebhookType = watch("type");
  const selectedEnvironment = watch("environment");
  const modalContainer = useRef<HTMLDivElement>(null);

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
      reset({
        type: WebhookType.GENERAL,
        enabledEvents: {
          [WebhookEvent.SecretModified]: true,
          [WebhookEvent.SecretRotationFailed]: true
        },
        environment: environments?.[0]?.slug,
        secretPath: ""
      });
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent ref={modalContainer} title="Create a new webhook">
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
                  helperText="Enter `/` to match all secret paths in the selected environment."
                >
                  <SecretPathInput {...field} environment={selectedEnvironment} placeholder="/" />
                </FormControl>
              )}
            />
            {renderFormFields()}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced-settings" className="data-[state=open]:border-none">
                <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
                  <div className="order-1 ml-3">Advanced Settings</div>
                </AccordionTrigger>
                <AccordionContent childrenClassName="p-0 pt-2">
                  <Controller
                    control={control}
                    name="enabledEvents"
                    render={({ field: { value, onChange } }) => {
                      const selectedOptions = EVENT_OPTIONS.filter(
                        (option) => value?.[option.value]
                      );
                      const hasSelection = selectedOptions.length > 0;

                      const handleChange = (selected: readonly TWebhookEventOption[]) => {
                        const next = WEBHOOK_EVENTS.reduce<Record<WebhookEvent, boolean>>(
                          (acc, event) => {
                            acc[event] = false;
                            return acc;
                          },
                          {} as Record<WebhookEvent, boolean>
                        );
                        selected.forEach((option) => {
                          next[option.value] = true;
                        });
                        onChange(next);
                      };

                      return (
                        <FormControl
                          label="Events"
                          helperText={
                            !hasSelection
                              ? "No events selected — the webhook will fire on all events."
                              : "Select which events will trigger this webhook."
                          }
                        >
                          <FilterableSelect
                            isMulti
                            options={EVENT_OPTIONS}
                            value={selectedOptions}
                            onChange={(selected) =>
                              handleChange(selected as readonly TWebhookEventOption[])
                            }
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
                      );
                    }}
                  />
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
