import { useEffect } from "react";
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

import { CREDENTIAL_LABELS, TConnectionForm, UNCHANGED_SECRET } from "./connectionSchema";

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
  /** The credential type as stored, so a switch away from it can invalidate the sealed secret. */
  storedType?: AgentVaultCredentialType;
};

export const CredentialFields = ({ isUpdate, storedHasPassword, storedType }: Props) => {
  const { control, watch, setValue } = useFormContext<TConnectionForm>();
  const credentialType = watch("credentialType");
  const secret = watch("secret");

  const isBasic = credentialType === AgentVaultCredentialType.Basic;
  const isUntouched = secret === UNCHANGED_SECRET;

  // Switching type strands the sealed secret, which belongs to the type being replaced, so the box
  // stops claiming to hold anything.
  useEffect(() => {
    if (isUntouched && storedType && credentialType !== storedType) setValue("secret", "");
  }, [isUntouched, credentialType, storedType, setValue]);

  const secretDescription = () => {
    if (!isUpdate) {
      return isBasic ? "Leave blank if the service carries the whole key in the username." : null;
    }
    if (isBasic && !storedHasPassword) {
      return "No password is stored. This connection authenticates by username alone.";
    }
    if (isBasic) {
      return "Type to replace it, or clear the field to remove the password.";
    }
    return "Type to replace it. A token cannot be removed — use Pass-through for a connection that sends nothing.";
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
                  // Selected rather than cleared, so focusing the field and moving on cannot remove a
                  // credential: typing still replaces the whole value, and leaving it alone keeps it.
                  onFocus={(e) => {
                    if (isUntouched) e.target.select();
                  }}
                  placeholder={isBasic ? "Enter the password" : "Enter the token"}
                  isError={Boolean(fieldState.error)}
                />
                {secretDescription() && <FieldDescription>{secretDescription()}</FieldDescription>}
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
