import crypto from "crypto";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DialogClose,
  DialogFooter,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
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
  onBack?: () => void;
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

export const MicrosoftTeamsIntegrationForm = ({ id, onClose, onBack }: Props) => {
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
        text: "Updated Microsoft Teams integration",
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

      const microsoftTeamsAuthorizationUrl = new URL(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
      );

      const queryParams = {
        client_id: microsoftTeamsClientId.clientId,
        redirect_uri: state.redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: "https://graph.microsoft.com/.default",
        state: JSON.stringify(state),
        prompt: "consent",
        admin_consent: "true"
      } as const;

      Object.entries(queryParams).forEach(([key, value]) => {
        microsoftTeamsAuthorizationUrl.searchParams.set(key, value);
      });
      window.location.href = microsoftTeamsAuthorizationUrl.toString();
    }
  };

  return (
    <form
      onSubmit={handleSubmit(handleMicrosoftTeamsFormSubmit)}
      className="flex flex-col gap-4"
      autoComplete="off"
    >
      <p className="text-xs text-muted">
        For seamless installations, ensure that the Infisical bot is already installed in your
        Microsoft Teams tenant. See the{" "}
        <a
          className="text-org underline underline-offset-2"
          href="https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration"
          target="_blank"
          rel="noopener noreferrer"
        >
          documentation
        </a>{" "}
        for the download and installation process.
      </p>
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="microsoft-teams-integration-alias">
              Alias <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="microsoft-teams-integration-alias" isError={Boolean(error)} {...field} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {!microsoftTeamsIntegration && (
        <Controller
          control={control}
          name="tenantId"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="microsoft-teams-integration-tenant-id">
                Tenant ID <span className="text-danger">*</span>
              </FieldLabel>
              <Input
                id="microsoft-teams-integration-tenant-id"
                isError={Boolean(error)}
                {...field}
              />
              <FieldError>{error?.message}</FieldError>
              <FieldDescription>The ID of the Microsoft Teams tenant to connect.</FieldDescription>
            </Field>
          )}
        />
      )}
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="microsoft-teams-integration-description">Description</FieldLabel>
            <Input
              id="microsoft-teams-integration-description"
              isError={Boolean(error)}
              {...field}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {microsoftTeamsIntegration && (
        <Field>
          <FieldLabel htmlFor="microsoft-teams-integration-tenant">
            Connected Microsoft Teams tenant
          </FieldLabel>
          <Input
            id="microsoft-teams-integration-tenant"
            value={microsoftTeamsIntegration.tenantId}
            readOnly
          />
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
          isPending={isSubmitting}
          isDisabled={!isDirty || isSubmitting}
        >
          {id && microsoftTeamsIntegration ? "Save" : "Connect Microsoft Teams"}
        </Button>
      </DialogFooter>
    </form>
  );
};
