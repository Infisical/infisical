import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import axios from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  fetchSlackInstallUrl,
  useGetSlackIntegrationById,
  useUpdateSlackIntegration
} from "@app/hooks/api";

type Props = {
  id?: string;
  onClose: () => void;
};

const slackFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .refine((v) => slugify(v) === v, {
      message: "Alias must be a valid slug"
    }),
  description: z.string().optional()
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

  const router = useRouter();
  const [isConnectLoading, setIsConnectLoading] = useToggle(false);
  const { currentOrg } = useOrganization();
  const { data: slackIntegration } = useGetSlackIntegrationById(id);
  const { mutateAsync: updateSlackIntegration } = useUpdateSlackIntegration();

  useEffect(() => {
    if (slackIntegration) {
      setValue("slug", slackIntegration.slug);
      setValue("description", slackIntegration.description ?? "");
    }
  }, [slackIntegration]);

  const triggerSlackInstall = async (slug: string, description?: string) => {
    setIsConnectLoading.on();
    try {
      const slackInstallUrl = await fetchSlackInstallUrl({
        slug,
        description
      });
      if (slackInstallUrl) {
        router.push(slackInstallUrl);
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

  const handleSlackFormSubmit = async ({ slug, description }: TSlackFormData) => {
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
      await triggerSlackInstall(slug, description);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleSlackFormSubmit)} autoComplete="off">
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
