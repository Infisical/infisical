import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import z from "zod";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
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
      <Helmet>
        <title>Authorize Azure Key Vault Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Authenticate with a specific tenant ID or let OAuth handle it automatically."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img
                src="/images/integrations/Microsoft Azure.png"
                height={30}
                width={30}
                alt="Azure Key Vault logo"
              />
            </div>
            <span className="ml-2.5">Azure Key Vault Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cloud/azure-key-vault"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-xxs"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <form onSubmit={handleSubmit(onFormSubmit)} className="px-6 pb-8 text-right">
          <Controller
            control={control}
            name="tenantId"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Tenant ID (optional)"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input {...field} placeholder="2e39537c-9a01-4bd6-a7b8-c3b88cbb8db9" />
              </FormControl>
            )}
          />
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mt-2 w-min"
            size="sm"
            type="submit"
          >
            Connect to Azure Key Vault
          </Button>
        </form>
      </Card>
    </div>
  );
}
