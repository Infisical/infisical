import { Controller, useFormContext } from "react-hook-form";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import { CREDENTIAL_LABELS, TConnectionForm } from "./connectionSchema";

export const credentialPreview = (form: {
  credentialType: AgentVaultCredentialType;
  headerName?: string;
  headerPrefix?: string;
}) => {
  if (form.credentialType === AgentVaultCredentialType.Passthrough) return "Nothing is added.";
  if (form.credentialType === AgentVaultCredentialType.Basic)
    return "Authorization: Basic ••••••••";
  const prefix = form.headerPrefix ? `${form.headerPrefix} ` : "";
  return `${form.headerName || "Authorization"}: ${prefix}••••••••`;
};

type Props = {
  isUpdate: boolean;
};

export const CredentialFields = ({ isUpdate }: Props) => {
  const { control, watch } = useFormContext<TConnectionForm>();
  const credentialType = watch("credentialType");

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="credentialType"
        render={({ field }) => (
          <Field>
            <FieldLabel>Credential Type</FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AgentVaultCredentialType).map((value) => (
                    <SelectItem key={value} value={value}>
                      {CREDENTIAL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        )}
      />

      {credentialType === AgentVaultCredentialType.Bearer && (
        <>
          <Controller
            control={control}
            name="headerName"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Header Name</FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="Authorization" />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="headerPrefix"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Prefix</FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="Bearer" />
                  <FieldDescription>
                    Leave blank for headers that carry the key on its own.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}

      {credentialType === AgentVaultCredentialType.Basic && (
        <Controller
          control={control}
          name="username"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Username</FieldLabel>
              <FieldContent>
                <Input {...field} placeholder="bot@acme.dev" />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {credentialType !== AgentVaultCredentialType.Passthrough && (
        <Controller
          control={control}
          name="secret"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>
                {credentialType === AgentVaultCredentialType.Basic ? "Password" : "Token"}
              </FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  type="password"
                  placeholder={
                    credentialType === AgentVaultCredentialType.Basic
                      ? "Enter the password"
                      : "Enter the token"
                  }
                  isError={Boolean(fieldState.error)}
                />
                {isUpdate && (
                  <FieldDescription>Leave blank to keep the current secret.</FieldDescription>
                )}
                {!isUpdate && credentialType === AgentVaultCredentialType.Basic && (
                  <FieldDescription>
                    Leave blank if the service carries the whole key in the username.
                  </FieldDescription>
                )}
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {credentialType === AgentVaultCredentialType.Passthrough && (
        <Alert variant="info">
          <AlertTitle>No credential is attached</AlertTitle>
          <AlertDescription>
            Under a proxy that allows unmatched hosts this only terminates TLS. It earns its keep on
            a proxy set to deny.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
