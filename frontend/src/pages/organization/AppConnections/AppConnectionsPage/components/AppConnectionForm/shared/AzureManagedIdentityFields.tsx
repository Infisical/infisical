import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Info, KeyRoundIcon } from "lucide-react";

import {
  Button,
  CopyButton,
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
import { ScopeVariant } from "@app/hooks/useScopeVariant";

import { useAppConnectionForm } from "../AppConnectionFormContext";

// Marks the value generated for this connection, in the scope's color like its buttons
const GENERATED_VALUE_BORDER: Record<ScopeVariant, string> = {
  org: "border-org/25",
  project: "border-project/25",
  "sub-org": "border-sub-org/25",
  av: "border-product-av/30",
  ss: "border-product-ss/30"
};

const CopyableValue = ({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-accent">{label}</span>
    <div
      className={`flex items-start gap-2 rounded-md border bg-container py-2 pr-2 pl-3 ${className ?? "border-border"}`}
    >
      <code className="min-w-0 grow font-mono text-xs leading-5 break-all text-foreground">
        {value}
      </code>
      <CopyButton value={value} ariaLabel={`Copy ${label}`} />
    </div>
  </div>
);

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
                  <CopyableValue label="Issuer" value={federatedCredential.issuerUrl} />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-accent">Issuer</span>
                    <p className="text-xs leading-normal text-danger">
                      The issuer is unavailable because SITE_URL is not set. Set it to this
                      instance&apos;s public URL.
                    </p>
                  </div>
                )}
                <CopyableValue
                  label="Subject Identifier"
                  value={federatedCredential.subjectIdentifier}
                  className={GENERATED_VALUE_BORDER[scopeVariant]}
                />
                <CopyableValue label="Audience" value={federatedCredential.audience} />
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
