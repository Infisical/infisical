import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const formSchema = z.object({
  vaultURL: z.string().url({ message: "Invalid Hashicorp Vault URL" }),
  vaultNamespace: z.string().optional(),
  vaultRoleID: z.string().uuid({ message: "Role ID has be a valid UUID" }),
  vaultSecretID: z.string().uuid({ message: "Role ID has be a valid UUID" })
});

type TForm = z.infer<typeof formSchema>;

export const HashicorpVaultAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vaultURL: "",
      vaultNamespace: "",
      vaultRoleID: "",
      vaultSecretID: ""
    }
  });

  const handleFormSubmit = async (formData: TForm) => {
    const integrationAuth = await mutateAsync({
      workspaceId: currentProject.id,
      integration: "hashicorp-vault",
      accessId: formData.vaultRoleID,
      accessToken: formData.vaultSecretID,
      url: formData.vaultURL,
      namespace: formData.vaultNamespace
    });
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/hashicorp-vault/create",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      },
      search: {
        integrationAuthId: integrationAuth.id
      }
    });
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Authorize Vault Integration" />
      <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img
                src="/images/integrations/Vault.png"
                height={30}
                width={30}
                alt="HCP Vault logo"
              />
              HashiCorp Vault Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/hashicorp-vault" />
            </CardTitle>
            <CardDescription>
              After connecting to Vault, you will be prompted to set up an integration for a
              particular Infisical project and environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="vaultURL"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultAuthorizePage-field-1">
                    Vault Cluster URL
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultAuthorizePage-field-1"
                    aria-required
                    aria-describedby="HashicorpVaultAuthorizePage-field-1-feedback"
                    isError={Boolean(error)}
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder=""
                    {...field}
                  />
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultAuthorizePage-field-1-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="vaultNamespace"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultAuthorizePage-field-2">
                    Vault Namespace
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultAuthorizePage-field-2"
                    aria-describedby="HashicorpVaultAuthorizePage-field-2-feedback"
                    isError={Boolean(error)}
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="admin/education"
                    {...field}
                  />
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultAuthorizePage-field-2-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="vaultRoleID"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultAuthorizePage-field-3">
                    Vault RoleID
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultAuthorizePage-field-3"
                    aria-required
                    aria-describedby="HashicorpVaultAuthorizePage-field-3-feedback"
                    isError={Boolean(error)}
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="aaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaa"
                    {...field}
                  />
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultAuthorizePage-field-3-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="vaultSecretID"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultAuthorizePage-field-4">
                    Vault SecretID
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultAuthorizePage-field-4"
                    aria-required
                    aria-describedby="HashicorpVaultAuthorizePage-field-4-feedback"
                    isError={Boolean(error)}
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="aaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaa"
                    {...field}
                  />
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultAuthorizePage-field-4-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button type="submit" isPending={isSubmitting} variant="project">
              Connect to Vault
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
