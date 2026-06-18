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
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
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
          <p className="truncate text-xs leading-4 text-muted">{data.description}</p>
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
      [WebhookEvent.SecretRotationFailed]: true,
      [WebhookEvent.HoneyTokenTriggered]: true
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
        [WebhookEvent.SecretRotationFailed]: true,
        [WebhookEvent.HoneyTokenTriggered]: true
      }
    }
  });

  const selectedWebhookType = watch("type");
  const selectedEnvironment = watch("environment");
  const modalContainer = useRef<HTMLDivElement>(null);

  const generalFormFields = (
    <>
      <Field>
        <FieldLabel htmlFor="webhook-secret-key">Secret Key</FieldLabel>
        <Input
          id="webhook-secret-key"
          placeholder="Provided during webhook setup"
          isError={Boolean(errors?.webhookSecretKey)}
          {...register("webhookSecretKey")}
        />
        <FieldError>{errors?.webhookSecretKey?.message}</FieldError>
        <FieldDescription>To generate webhook signature for verification</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
        <Input id="webhook-url" isError={Boolean(errors?.webhookUrl)} {...register("webhookUrl")} />
        <FieldError>{errors?.webhookUrl?.message}</FieldError>
      </Field>
    </>
  );

  const slackFormFields = (
    <Field>
      <FieldLabel htmlFor="webhook-url">Incoming Webhook URL</FieldLabel>
      <Input
        id="webhook-url"
        placeholder="https://hooks.slack.com/services/..."
        isError={Boolean(errors?.webhookUrl)}
        {...register("webhookUrl")}
      />
      <FieldError>{errors?.webhookUrl?.message}</FieldError>
    </Field>
  );

  const microsoftTeamsFormFields = (
    <Field>
      <FieldLabel htmlFor="webhook-url">Incoming Webhook URL</FieldLabel>
      <Input
        id="webhook-url"
        placeholder="https://<tenant>.webhook.office.com/webhookb2/..."
        isError={Boolean(errors?.webhookUrl)}
        {...register("webhookUrl")}
      />
      <FieldError>{errors?.webhookUrl?.message}</FieldError>
    </Field>
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
          [WebhookEvent.SecretRotationFailed]: true,
          [WebhookEvent.HoneyTokenTriggered]: true
        },
        environment: environments?.[0]?.slug,
        secretPath: ""
      });
    }
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <div ref={modalContainer} className="flex h-full min-h-0 flex-col">
          <form onSubmit={handleSubmit(onCreateWebhook)} className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle>Create a new webhook</SheetTitle>
            </SheetHeader>
            <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4">
              <Controller
                control={control}
                name="type"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="webhook-type">Type</FieldLabel>
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger
                        id="webhook-type"
                        className="w-full"
                        aria-invalid={Boolean(error)}
                      >
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value={WebhookType.GENERAL}>General</SelectItem>
                        <SelectItem value={WebhookType.SLACK}>Slack</SelectItem>
                        <SelectItem value={WebhookType.MICROSOFT_TEAMS}>Microsoft Teams</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="environment"
                defaultValue={environments?.[0]?.slug}
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="webhook-environment">Environment</FieldLabel>
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger
                        id="webhook-environment"
                        className="w-full"
                        aria-invalid={Boolean(error)}
                      >
                        <SelectValue placeholder="Select an environment" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {environments.map(({ name, slug }) => (
                          <SelectItem value={slug} key={slug}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="secretPath"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="webhook-secret-path">Secret Path</FieldLabel>
                    <SecretPathInput
                      {...field}
                      id="webhook-secret-path"
                      environment={selectedEnvironment}
                      placeholder="/"
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                    <FieldDescription>
                      Enter `/` to match all secret paths in the selected environment.
                    </FieldDescription>
                  </Field>
                )}
              />
              {renderFormFields()}
              <Accordion type="single" collapsible variant="ghost" className="w-full">
                <AccordionItem value="advanced-settings">
                  <AccordionTrigger>Advanced Settings</AccordionTrigger>
                  <AccordionContent>
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
                          <Field>
                            <FieldLabel htmlFor="webhook-events">Events</FieldLabel>
                            <FilterableSelect
                              isMulti
                              inputId="webhook-events"
                              options={EVENT_OPTIONS}
                              value={selectedOptions}
                              onChange={(selected) =>
                                handleChange(selected as readonly TWebhookEventOption[])
                              }
                              getOptionValue={(option) => option.value}
                              getOptionLabel={(option) => option.label}
                              placeholder="Select events..."
                              menuPortalTarget={modalContainer.current}
                              menuPosition="fixed"
                              menuPlacement="bottom"
                              closeMenuOnSelect={false}
                              hideSelectedOptions={false}
                              components={{ Option: OptionWithDescription }}
                            />
                            <FieldDescription>
                              {!hasSelection
                                ? "No events selected. The webhook will fire on all events."
                                : "Select which events will trigger this webhook."}
                            </FieldDescription>
                          </Field>
                        );
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <SheetFooter className="justify-end border-t">
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </SheetClose>
              <Button
                type="submit"
                variant="project"
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                Create webhook
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};
