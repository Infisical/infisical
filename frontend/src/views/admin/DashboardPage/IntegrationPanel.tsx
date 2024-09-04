import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import {
  useGetAdminSlackConfig,
  useGetCustomSlackAppCreationUrl,
  useUpdateAdminSlackConfig
} from "@app/hooks/api";

const slackFormSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string()
});

type TSlackForm = z.infer<typeof slackFormSchema>;

export const IntegrationPanel = () => {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TSlackForm>({
    resolver: zodResolver(slackFormSchema)
  });

  const { data: customSlackAppCreationUrl } = useGetCustomSlackAppCreationUrl();
  const { data: adminSlackConfig } = useGetAdminSlackConfig();

  const { mutateAsync: updateAdminSlackConfig } = useUpdateAdminSlackConfig();

  useEffect(() => {
    if (adminSlackConfig) {
      setValue("clientId", adminSlackConfig.clientId);
      setValue("clientSecret", adminSlackConfig.clientSecret);
    }
  }, [adminSlackConfig]);

  const onSlackFormSubmit = async (data: TSlackForm) => {
    await updateAdminSlackConfig(data);

    createNotification({
      text: "Updated admin slack configuration",
      type: "success"
    });
  };

  return (
    <form
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      onSubmit={handleSubmit(onSlackFormSubmit)}
    >
      <div className="flex flex-col justify-start">
        <div className="mb-2 text-xl font-semibold text-mineshaft-100">Slack Integration</div>
        <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
          Step 1: Create your Infisical Slack App
        </div>
        <div className="mb-6">
          <Button colorSchema="secondary" onClick={() => window.open(customSlackAppCreationUrl)}>
            Create Slack App
          </Button>
        </div>
        <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
          Step 2: Configure your instance-wide settings to enable integration with Slack. Copy the
          values from the App Credentials page of your custom Slack App.
        </div>
        <Controller
          control={control}
          name="clientId"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Client ID"
              className="w-96"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="clientSecret"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Client Secret"
              className="w-96"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
      </div>
      <Button
        className="mt-2"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting || !isDirty}
      >
        Save
      </Button>
    </form>
  );
};
