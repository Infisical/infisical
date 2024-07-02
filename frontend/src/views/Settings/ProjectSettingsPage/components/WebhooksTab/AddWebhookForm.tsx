import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

import GlobPatternExamples from "@app/components/basic/popups/GlobPatternExamples";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";

enum WebhookType {
  GENERAL = "general",
  SLACK = "slack"
}

const formSchema = z
  .object({
    environment: z.string().trim().describe("Environment"),
    webhookUrl: z.string().url().trim().describe("Webhook URL"),
    webhookSecretKey: z.string().trim().optional().describe("Secret Key"),
    secretPath: z.string().trim().describe("Secret Path"),
    type: z.nativeEnum(WebhookType).describe("Type").default(WebhookType.GENERAL)
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

type TFormSchema = z.infer<typeof formSchema>;

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
      type: WebhookType.GENERAL
    }
  });

  const webhookType = watch("type");

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
              defaultValue={WebhookType.GENERAL}
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
            <FormControl
              label="Secret Path"
              icon={<GlobPatternExamples />}
              isRequired
              isError={Boolean(errors?.secretPath)}
              errorText={errors?.secretPath?.message}
              helperText="Glob patterns are used to match multiple files or directories"
            >
              <Input
                placeholder="glob pattern / or /**/* or /{dir1,dir2}"
                {...register("secretPath")}
              />
            </FormControl>
            {webhookType === WebhookType.GENERAL && (
              <FormControl
                label="Secret Key"
                isError={Boolean(errors?.webhookSecretKey)}
                errorText={errors?.webhookSecretKey?.message}
                helperText="To generate webhook signature for verification"
              >
                <Input
                  placeholder="Provided during webhook setup"
                  {...register("webhookSecretKey")}
                />
              </FormControl>
            )}
            <FormControl
              label={webhookType === WebhookType.SLACK ? "Incoming Webhook URL" : "Webhook URL"}
              isRequired
              isError={Boolean(errors?.webhookUrl)}
              errorText={errors?.webhookUrl?.message}
            >
              <Input
                placeholder={
                  webhookType === WebhookType.SLACK ? "https://hooks.slack.com/services/..." : ""
                }
                {...register("webhookUrl")}
              />
            </FormControl>
          </div>
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              type="submit"
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Create
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
