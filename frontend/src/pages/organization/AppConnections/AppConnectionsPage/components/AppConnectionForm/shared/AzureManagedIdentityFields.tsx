import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Info, KeyRoundIcon } from "lucide-react";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { TAzureFederatedCredential } from "@app/hooks/api/appConnections/types/azure-federated-credential";

import { useAppConnectionForm } from "../AppConnectionFormContext";
import { FederatedCredentialValue, GENERATED_VALUE_BORDER } from "./FederatedCredentialValue";

export const AzureManagedIdentityConnectionDetails = ({
  appConnection
}: {
  appConnection: { name: string; description?: string | null };
}) => (
  <>
    <Field className="mb-4">
      <FieldLabel htmlFor="app-connection-name">Name</FieldLabel>
      <Input id="app-connection-name" value={appConnection.name} readOnly disabled />
    </Field>
    <Field className="mb-4">
      <FieldLabel htmlFor="app-connection-description">
        Description <span className="text-muted">(optional)</span>
      </FieldLabel>
      <TextArea
        id="app-connection-description"
        className="resize-none"
        rows={2}
        placeholder="Connection description..."
        value={appConnection.description ?? ""}
        readOnly
        disabled
      />
    </Field>
  </>
);

type Props = {
  isUpdate: boolean;
  federatedCredential?: TAzureFederatedCredential;
  onCredentialsChange: () => void;
  children?: ReactNode;
};

export const AzureManagedIdentityFields = ({
  isUpdate,
  federatedCredential,
  onCredentialsChange,
  children
}: Props) => {
  const {
    control,
    formState: { isSubmitting }
  } = useFormContext<{ credentials: { tenantId: string; clientId: string } }>();
  const { isNewConnection } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();

  return (
    <>
      <Controller
        name="credentials.tenantId"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="credentials.tenantId">
              Tenant ID
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The Azure Active Directory (Entra ID) Tenant ID.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              {...field}
              onChange={(e) => {
                field.onChange(e);
                onCredentialsChange();
              }}
              id="credentials.tenantId"
              disabled={isNewConnection}
              placeholder="00000000-0000-0000-0000-000000000000"
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        name="credentials.clientId"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="credentials.clientId">Client ID</FieldLabel>
            <Input
              {...field}
              onChange={(e) => {
                field.onChange(e);
                onCredentialsChange();
              }}
              id="credentials.clientId"
              disabled={isNewConnection}
              placeholder="00000000-0000-0000-0000-000000000000"
              isError={Boolean(error)}
            />
            <FieldDescription>
              The client ID of the user-assigned managed identity.
            </FieldDescription>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      {children}
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <span className="text-sm font-medium">Federated Credential</span>
        {isUpdate ? (
          <>
            <p className="text-xs leading-normal text-accent">
              Add these values to the managed identity in Azure, then verify the connection.
            </p>
            {federatedCredential && (
              <>
                {federatedCredential.issuerUrl ? (
                  <FederatedCredentialValue label="Issuer" value={federatedCredential.issuerUrl} />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-accent">Issuer</span>
                    <p className="text-xs leading-normal text-danger">
                      The issuer is unavailable because SITE_URL is not set. Set it to this
                      instance&apos;s public URL.
                    </p>
                  </div>
                )}
                <FederatedCredentialValue
                  label="Subject Identifier"
                  value={federatedCredential.subjectIdentifier}
                  className={GENERATED_VALUE_BORDER[scopeVariant]}
                />
                <FederatedCredentialValue label="Audience" value={federatedCredential.audience} />
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-xs leading-normal text-accent">
              The subject identifier includes the connection ID, so Infisical creates the connection
              first. Configure the federated credential to generate it.
            </p>
            <Button
              type="submit"
              size="sm"
              variant={scopeVariant}
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              <KeyRoundIcon />
              {isSubmitting ? "Creating Connection" : "Configure Federated Credential"}
            </Button>
          </>
        )}
      </div>
    </>
  );
};
