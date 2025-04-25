import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useCreateMicrosoftTeamsIntegration,
  useGetMicrosoftTeamsIntegrationById,
  useUpdateMicrosoftTeamsIntegration
} from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  id?: string;
  onClose: () => void;
};

const microsoftTeamsFormSchema = z.object({
  slug: slugSchema({ min: 1, field: "Alias" }),
  tenantId: z.string().min(1, { message: "Tenant ID is required" }).trim(),
  description: z.string().optional()
});

type TMicrosoftTeamsFormData = z.infer<typeof microsoftTeamsFormSchema>;

export const MicrosoftTeamsIntegrationForm = ({ id, onClose }: Props) => {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TMicrosoftTeamsFormData>({
    resolver: zodResolver(microsoftTeamsFormSchema)
  });

  const { currentOrg } = useOrganization();
  const { data: microsoftTeamsIntegration } = useGetMicrosoftTeamsIntegrationById(id);
  const { mutateAsync: createMicrosoftTeamsIntegration } = useCreateMicrosoftTeamsIntegration();
  const { mutateAsync: updateMicrosoftTeamsIntegration } = useUpdateMicrosoftTeamsIntegration();

  useEffect(() => {
    if (microsoftTeamsIntegration) {
      setValue("slug", microsoftTeamsIntegration.slug);
      setValue("description", microsoftTeamsIntegration.description ?? "");
      setValue("tenantId", microsoftTeamsIntegration.tenantId);
    }
  }, [microsoftTeamsIntegration]);

  const handleMicrosoftTeamsFormSubmit = async ({
    slug,
    description,
    tenantId
  }: TMicrosoftTeamsFormData) => {
    if (id && microsoftTeamsIntegration) {
      if (!currentOrg) {
        return;
      }

      if (tenantId !== microsoftTeamsIntegration.tenantId) {
        createNotification({
          text: "Tenant ID cannot be changed",
          type: "error"
        });
        return;
      }

      await updateMicrosoftTeamsIntegration({
        id,
        orgId: currentOrg.id,
        slug,
        description
      });

      createNotification({
        text: "Successfully updated Microsoft Teams integration",
        type: "success"
      });

      onClose();
    } else {
      await createMicrosoftTeamsIntegration({
        orgId: currentOrg.id,
        tenantId,
        slug,
        description
      });

      onClose();
      createNotification({
        text: "Successfully created Microsoft Teams integration",
        type: "success"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleMicrosoftTeamsFormSubmit)} autoComplete="off">
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Alias" isRequired errorText={error?.message} isError={Boolean(error)}>
            <Input placeholder="" {...field} />
          </FormControl>
        )}
      />
      {!microsoftTeamsIntegration && (
        <Controller
          control={control}
          name="tenantId"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isRequired
              label="Tenant ID"
              errorText={error?.message}
              isError={Boolean(error)}
            >
              <Input placeholder="" {...field} />
            </FormControl>
          )}
        />
      )}
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Description" errorText={error?.message} isError={Boolean(error)}>
            <Input placeholder="" {...field} />
          </FormControl>
        )}
      />
      {microsoftTeamsIntegration && (
        <FormControl label="Connected Microsoft Teams Tenant">
          <Input
            value={microsoftTeamsIntegration.tenantId}
            isReadOnly
            className="bg-white/[0.07]"
          />
        </FormControl>
      )}
      <div className="mt-6 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting} isDisabled={!isDirty || isSubmitting}>
          {id && microsoftTeamsIntegration ? "Save" : "Create Microsoft Teams Integration"}
        </Button>
        <Button variant="outline_bg" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
