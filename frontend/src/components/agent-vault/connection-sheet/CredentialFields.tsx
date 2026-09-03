import { Controller, useFormContext } from "react-hook-form";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
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
  /** Whether the connection being edited already has a password sealed. Meaningless on create. */
  storedHasPassword: boolean;
};

export const CredentialFields = ({ isUpdate, storedHasPassword }: Props) => {
  const { control, watch, setValue } = useFormContext<TConnectionForm>();
  const credentialType = watch("credentialType");
  const username = watch("username");
  const clearPassword = watch("clearPassword");

  const isBasic = credentialType === AgentVaultCredentialType.Basic;
  // Removing the password is only ever offered when a username would be left behind to authenticate
  // with, and only when there is something to remove.
  const canClearPassword = isUpdate && isBasic && storedHasPassword && Boolean(username);

  const secretDescription = () => {
    if (!isUpdate) {
      return isBasic ? "Leave blank if the service carries the whole key in the username." : null;
    }
    if (isBasic && !storedHasPassword) {
      return "No password is stored. This connection authenticates by username alone.";
    }
    return `Leave blank to keep the current ${isBasic ? "password" : "token"}.`;
  };

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
              <FieldLabel>{isBasic ? "Password" : "Token"}</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  type="password"
                  disabled={clearPassword}
                  placeholder={isBasic ? "Enter the password" : "Enter the token"}
                  isError={Boolean(fieldState.error)}
                  onChange={(e) => {
                    field.onChange(e);
                    if (e.target.value) setValue("clearPassword", false);
                  }}
                />
                {secretDescription() && <FieldDescription>{secretDescription()}</FieldDescription>}
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {canClearPassword && (
        <Controller
          control={control}
          name="clearPassword"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="clear-password"
                isChecked={Boolean(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(checked === true);
                  if (checked === true) setValue("secret", "");
                }}
              />
              <FieldContent>
                <FieldTitle>Remove the password</FieldTitle>
                <FieldDescription>
                  The connection authenticates by username alone, as services that carry the whole
                  key there expect.
                </FieldDescription>
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
