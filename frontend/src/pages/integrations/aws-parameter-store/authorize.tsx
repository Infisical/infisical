import { useCallback } from "react";
import { Control, Controller } from "react-hook-form";
import { z } from "zod";

import { FormControl, Input } from "@app/components/v2";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import IntegrationAuth from "../../../components/integrations/IntegrationAuthorize";

const formSchema = z.object({
  accessId: z.string().trim().min(1, { message: "Access key cannot be blank" }),
  accessToken: z.string().trim().min(1, { message: "Secret key cannot be blank" })
});

// TODO: make it even more generic so that we can represent integrations as a list
// and render them as a list inside some outer component that will manage integrations
export default function AWSParameterStoreAuthorizeIntegrationPage() {
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const renderFormFields = useCallback((control: Control<z.TypeOf<typeof formSchema>, any>) => {
    return (
      <>
        <Controller
          control={control}
          name="accessId"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Access Key ID"
              errorText={error?.message}
              isError={Boolean(error)}
              isRequired
              autoFocus
            >
              <Input
                placeholder=""
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                {...field}
              />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="accessToken"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Secret Access Key"
              errorText={error?.message}
              isError={Boolean(error)}
              isRequired
            >
              <Input
                placeholder=""
                type="password"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                {...field}
              />
            </FormControl>
          )}
        />
      </>
    );
  }, []);

  return (
    <IntegrationAuth
      integrationName="AWS Parameter Store"
      integrationID="aws-parameter-store"
      cardSubtitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
      imageSrc="/images/integrations/Amazon Web Services.png"
      documentationLink="https://infisical.com/docs/integrations/cloud/aws-parameter-store"
      renderFormFields={renderFormFields}
      formSchema={formSchema}
      defaultValues={{
        // TODO: potentially need to use useMemo
        accessId: "",
        accessToken: ""
      }}
      saveIntegration={mutateAsync}
      logoWidth={35}
      logoHeight={35}
    />
  );
}

AWSParameterStoreAuthorizeIntegrationPage.requireAuth = true;
