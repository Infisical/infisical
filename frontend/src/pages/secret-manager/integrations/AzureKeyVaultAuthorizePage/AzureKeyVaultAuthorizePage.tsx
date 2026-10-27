import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import z from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";

const schema = z.object({
  tenantId: z.string().trim().optional()
});

type FormData = z.infer<typeof schema>;

export function AzureKeyVaultAuthorizePage() {
  const { state, clientId } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureKeyVaultAuthorizePage.id
  });

  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ tenantId }: FormData) => {
    const link = `https://login.microsoftonline.com/${
      tenantId ?? "common"
    }/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${
      window.location.origin
    }/integrations/azure-key-vault/oauth2/callback&response_mode=query&scope=https://vault.azure.net/.default openid offline_access&state=${state}`;

    window.location.assign(link);
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Authorize Azure Key Vault Integration" />
      <link rel="icon" href="/infisical.ico" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Microsoft Azure.png"
              height={30}
              width={30}
              alt="Azure Key Vault logo"
            />
            <span>Azure Key Vault Integration</span>
          </CardTitle>
          <CardDescription>
            Authenticate with a specific tenant ID or let OAuth handle it automatically.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/azure-key-vault"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-5">
          <CardContent>
            <Controller
              control={control}
              name="tenantId"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="azurekeyvault-tenantid">Tenant ID (optional)</FieldLabel>
                  <Input
                    {...field}
                    placeholder="2e39537c-9a01-4bd6-a7b8-c3b88cbb8db9"
                    id="azurekeyvault-tenantid"
                    isError={Boolean(error)}
                    aria-describedby={error ? "azurekeyvault-tenantid-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="azurekeyvault-tenantid-error">{error?.message}</FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button size="sm" type="submit" variant="project">
              Connect to Azure Key Vault
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
