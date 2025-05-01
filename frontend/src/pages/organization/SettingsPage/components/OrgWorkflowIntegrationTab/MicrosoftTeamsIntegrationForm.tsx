import crypto from "crypto";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useGetMicrosoftTeamsClientId,
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
  tenantId: z
    .string()
    .min(1, { message: "Tenant ID is required" })
    .trim()
    .uuid("Tenant ID must be a valid UUID"),
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
  const { mutateAsync: updateMicrosoftTeamsIntegration } = useUpdateMicrosoftTeamsIntegration();
  const { data: microsoftTeamsClientId } = useGetMicrosoftTeamsClientId();

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
    if (!microsoftTeamsClientId) {
      createNotification({
        text: "Microsoft Teams client ID is not set. Please contact your instance administrator.",
        type: "error"
      });
      return;
    }

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
      const csrfToken = crypto.randomBytes(32).toString("hex");
      localStorage.setItem("latestCSRFToken", csrfToken);

      const state = {
        redirectUri: `${window.location.origin}/organization/settings/oauth/callback`,
        tenantId,
        slug,
        description,
        csrfToken,
        clientId: microsoftTeamsClientId.clientId
      };

      const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?
      client_id=${microsoftTeamsClientId.clientId}
      &redirect_uri=${state.redirectUri}
      &response_type=code
      &response_mode=query
      &scope=https://graph.microsoft.com/.default
      &state=${encodeURIComponent(JSON.stringify(state))}
      &prompt=consent
      &admin_consent=true`;

      window.location.href = url;
    }
  };

  return (
    <form onSubmit={handleSubmit(handleMicrosoftTeamsFormSubmit)} autoComplete="off">
      <div className="mb-4 text-xs text-mineshaft-200">
        For seamless installations, ensure that the Infisical bot is already installed in your
        Microsoft Teams tenant. For more information, please refer to the{" "}
        <a
          className="text-primary-500"
          href="https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration"
          target="_blank"
          rel="noopener noreferrer"
        >
          Microsoft Teams Workflow Integration Documentation
        </a>
        , which will guide you through the download and installation process.
      </div>
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
