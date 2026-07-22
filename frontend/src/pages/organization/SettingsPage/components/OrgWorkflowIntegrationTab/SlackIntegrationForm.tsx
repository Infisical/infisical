import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DialogClose,
  DialogFooter,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  fetchSlackInstallUrl,
  useGetSlackIntegrationById,
  useUpdateSlackIntegration
} from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  id?: string;
  onClose: () => void;
  onBack?: () => void;
};

const slackFormSchema = z.object({
  slug: slugSchema({ min: 1, field: "Alias" }),
  description: z.string().optional()
});

type TSlackFormData = z.infer<typeof slackFormSchema>;

export const SlackIntegrationForm = ({ id, onClose, onBack }: Props) => {
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
        text: "Updated Slack integration",
        type: "success"
      });
    } else {
      await triggerSlackInstall(slug, description);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(handleSlackFormSubmit)}
      className="flex flex-col gap-4"
      autoComplete="off"
    >
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="slack-integration-alias">
              Alias <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="slack-integration-alias" isError={Boolean(error)} {...field} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="slack-integration-description">Description</FieldLabel>
            <Input id="slack-integration-description" isError={Boolean(error)} {...field} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {slackIntegration && (
        <Field>
          <FieldLabel htmlFor="slack-integration-workspace">Connected Slack workspace</FieldLabel>
          <Input id="slack-integration-workspace" value={slackIntegration?.teamName} readOnly />
        </Field>
      )}
      <DialogFooter>
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ChevronLeft />
            Back
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="org"
          isPending={isSubmitting || isConnectLoading}
          isDisabled={!isDirty || isConnectLoading || isSubmitting}
        >
          {slackIntegration ? "Save" : "Connect Slack"}
        </Button>
      </DialogFooter>
    </form>
  );
};
