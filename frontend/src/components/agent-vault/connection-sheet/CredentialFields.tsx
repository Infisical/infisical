import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Detail,
  DetailLabel,
  DetailValue,
  Field,
  FieldContent,
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

export const credentialPreview = (
  form: {
    credentialType: AgentVaultCredentialType;
    headerName?: string;
    headerPrefix?: string;
  },
  secret = "••••••••"
): string | null => {
  if (form.credentialType === AgentVaultCredentialType.Passthrough) return null;
  if (form.credentialType === AgentVaultCredentialType.Basic)
    return `Authorization: Basic ${secret}`;
  const prefix = form.headerPrefix ? `${form.headerPrefix} ` : "";
  return `${form.headerName || "Authorization"}: ${prefix}${secret}`;
};

type Props = {
  storedType?: AgentVaultCredentialType;
};

export const CredentialFields = ({ storedType }: Props) => {
  const { control, watch, setValue } = useFormContext<TConnectionForm>();
  const credentialType = watch("credentialType");
  const secret = watch("secret");
  const username = watch("username");
  const headerName = watch("headerName");
  const headerPrefix = watch("headerPrefix");

  const isBasic = credentialType === AgentVaultCredentialType.Basic;
  const isUntouched = secret === UNCHANGED_SECRET;
  const isUsernameUntouched = username === UNCHANGED_SECRET;

  useEffect(() => {
    if (!storedType || credentialType === storedType) return;
    if (isUntouched) setValue("secret", "");
    if (isUsernameUntouched) setValue("username", "");
  }, [isUntouched, isUsernameUntouched, credentialType, storedType, setValue]);

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
                <Input
                  {...field}
                  type="password"
                  onFocus={(e) => {
                    if (isUsernameUntouched) e.target.select();
                  }}
                  placeholder="Enter the username"
                  isError={Boolean(fieldState.error)}
                />
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
                  // Selected rather than cleared, so focusing the field and moving on cannot remove a credential.
                  onFocus={(e) => {
                    if (isUntouched) e.target.select();
                  }}
                  placeholder={isBasic ? "Enter the password" : "Enter the token"}
                  isError={Boolean(fieldState.error)}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {/* Only bearer composes anything: basic is a fixed header, so a preview there would never move. */}
      {credentialType === AgentVaultCredentialType.Bearer && (
        <Detail>
          <DetailLabel>Sends</DetailLabel>
          <DetailValue className="font-mono">
            {credentialPreview({ credentialType, headerName, headerPrefix }, "<token>")}
          </DetailValue>
        </Detail>
      )}

      {credentialType === AgentVaultCredentialType.Passthrough && (
        <Alert variant="info">
          <AlertTitle>No credentials are sent</AlertTitle>
          <AlertDescription>
            Requests go out as they are. On a proxy that denies everything else, this is what makes
            these hosts reachable.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
