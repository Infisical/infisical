import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  fetchSlackInstallUrl,
  useGetAdminIntegrationsConfig,
  useGetSlackIntegrationById,
  useUpdateSlackIntegration
} from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  id?: string;
  onClose: () => void;
};

const slackFormSchema = z.object({
  slug: slugSchema({ min: 1, field: "Alias" }),
  description: z.string().optional(),
  integrationType: z.enum(["slack", "govSlack"]).default("slack")
});

type TSlackFormData = z.infer<typeof slackFormSchema>;

export const SlackIntegrationForm = ({ id, onClose }: Props) => {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TSlackFormData>({
    resolver: zodResolver(slackFormSchema)
  });

  const [isConnectLoading, setIsConnectLoading] = useToggle(false);
  const { currentOrg } = useOrganization();
  const { data: slackIntegration } = useGetSlackIntegrationById(id);
  const { mutateAsync: updateSlackIntegration } = useUpdateSlackIntegration();
  const { data: adminIntegrationsConfig } = useGetAdminIntegrationsConfig();

  useEffect(() => {
    if (slackIntegration) {
      setValue("slug", slackIntegration.slug);
      setValue("description", slackIntegration.description ?? "");
    }
  }, [slackIntegration]);

  const triggerSlackInstall = async (slug: string, description?: string, isGovSlack?: boolean) => {
    setIsConnectLoading.on();
    try {
      const slackInstallUrl = await fetchSlackInstallUrl({
        slug,
        description,
        isGovSlack
      });
      if (slackInstallUrl) {
        window.location.assign(slackInstallUrl);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        createNotification({
          text: (err.response?.data as { message: string })?.message,
          type: "error"
        });
      }
    } finally {
      setIsConnectLoading.off();
    }
  };

  const handleSlackFormSubmit = async ({ slug, description, integrationType }: TSlackFormData) => {
    if (id && slackIntegration) {
      if (!currentOrg) {
        return;
      }

      await updateSlackIntegration({
        id,
        orgId: currentOrg?.id,
        slug,
        description
      });

      onClose();
      createNotification({
        text: "Successfully updated Slack integration",
        type: "success"
      });
    } else {
      await triggerSlackInstall(slug, description, integrationType === "govSlack");
    }
  };

  const isGovSlackAvailable =
    adminIntegrationsConfig?.govSlack?.clientId && adminIntegrationsConfig?.govSlack?.clientSecret;

  return (
    <form onSubmit={handleSubmit(handleSlackFormSubmit)} autoComplete="off">
      {!slackIntegration && (
        <Controller
          control={control}
          name="integrationType"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Integration Type"
              isRequired
              errorText={error?.message}
              isError={Boolean(error)}
            >
              <Select
                {...field}
                onValueChange={(value) => field.onChange(value)}
                className="w-full"
              >
                <SelectItem value="slack">Slack</SelectItem>
                {isGovSlackAvailable && <SelectItem value="govSlack">GovSlack</SelectItem>}
              </Select>
            </FormControl>
          )}
        />
      )}
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Alias" isRequired errorText={error?.message} isError={Boolean(error)}>
            <Input placeholder="" {...field} />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Description" errorText={error?.message} isError={Boolean(error)}>
            <Input placeholder="" {...field} />
          </FormControl>
        )}
      />
      {slackIntegration && (
        <FormControl label="Connected Slack workspace">
          <Input value={slackIntegration?.teamName} isReadOnly className="bg-white/[0.07]" />
        </FormControl>
      )}
      <div className="mt-6 flex items-center space-x-4">
        <Button
          type="submit"
          isLoading={isSubmitting || isConnectLoading}
          isDisabled={!isDirty || isConnectLoading || isSubmitting}
        >
          {slackIntegration ? "Save" : "Connect Slack"}
        </Button>
        <Button variant="outline_bg" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
