import { useEffect, useState } from "react";
import { Controller, ControllerRenderProps, useFormContext } from "react-hook-form";
import { EyeIcon, EyeOffIcon, XIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  CodeBlock,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import { CREDENTIAL_LABELS, TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";

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

type SecretName =
  | "secret"
  | "username"
  | `customHeaders.${number}.value`
  | `substitutions.${number}.value`;

export const SecretInput = <TName extends SecretName>({
  field,
  label,
  ariaLabel,
  placeholder,
  isError,
  isUntouched,
  hasStoredSecret,
  canBeCleared
}: {
  field: ControllerRenderProps<TServiceForm, TName>;
  label: string;
  /** Needed where the visible label renders on the first row only, as the repeating lists do. */
  ariaLabel?: string;
  placeholder: string;
  isError: boolean;
  isUntouched: boolean;
  /** Whether a stored secret stands behind the sentinel. False on create, and once the credential
   *  type moves away from the stored one, where there is nothing to restore or clear. */
  hasStoredSecret: boolean;
  /** Whether empty is a value this field can hold. Only such a field offers the clear button. */
  canBeCleared: boolean;
}) => {
  const { setFocus } = useFormContext<TServiceForm>();
  const [isVisible, setIsVisible] = useState(false);
  const [isCleared, setIsCleared] = useState(false);

  // The sheet is not unmounted between opens, so the flag has to follow the value back to the sentinel.
  useEffect(() => {
    if (isUntouched) setIsCleared(false);
  }, [isUntouched]);

  const lowerLabel = label.toLowerCase();

  return (
    <InputGroup>
      <InputGroupInput
        {...field}
        aria-label={ariaLabel}
        type={isVisible ? "text" : "password"}
        onChange={(event) => {
          setIsCleared(false);
          field.onChange(event);
        }}
        onFocus={() => {
          if (isUntouched) field.onChange("");
        }}
        // Empty reads the same whether the secret was meant to go or the field was only clicked into,
        // so the clear button is made the one way to say it and passing through loses nothing.
        onBlur={() => {
          if (hasStoredSecret && !field.value && !isCleared) field.onChange(UNCHANGED_SECRET);
          field.onBlur();
        }}
        placeholder={placeholder}
        isError={isError}
      />
      <InputGroupAddon align="inline-end">
        {canBeCleared && hasStoredSecret && (
          <InputGroupButton
            isDisabled={isCleared}
            aria-label={`Clear ${lowerLabel}`}
            onClick={() => {
              setIsCleared(true);
              field.onChange("");
              setFocus(field.name);
            }}
          >
            <XIcon />
          </InputGroupButton>
        )}
        <InputGroupButton
          // A stored credential is never returned, so until it is replaced there is nothing to reveal.
          isDisabled={isUntouched || !field.value}
          aria-label={`${isVisible ? "Hide" : "Show"} ${lowerLabel}`}
          onClick={() => setIsVisible((prev) => !prev)}
        >
          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
};

type Props = {
  storedType?: AgentVaultCredentialType;
};

export const CredentialFields = ({ storedType }: Props) => {
  const { control, watch, setValue } = useFormContext<TServiceForm>();
  const credentialType = watch("credentialType");
  const secret = watch("secret");
  const username = watch("username");
  const headerName = watch("headerName");
  const headerPrefix = watch("headerPrefix");

  const isBasic = credentialType === AgentVaultCredentialType.Basic;
  const isUntouched = secret === UNCHANGED_SECRET;
  const isUsernameUntouched = username === UNCHANGED_SECRET;
  // A stored secret belongs to the type it was saved under, so switching type leaves nothing behind it.
  const hasStoredSecret = Boolean(storedType) && credentialType === storedType;

  useEffect(() => {
    if (!storedType || credentialType === storedType) return;
    if (isUntouched) setValue("secret", "");
    if (isUsernameUntouched) setValue("username", "");
  }, [isUntouched, isUsernameUntouched, credentialType, storedType, setValue]);

  const secretField = (
    <Controller
      control={control}
      name="secret"
      render={({ field, fieldState }) => (
        <Field className="flex-1">
          <FieldLabel>{isBasic ? "Password" : "Token"}</FieldLabel>
          <FieldContent>
            <SecretInput
              field={field}
              label={isBasic ? "Password" : "Token"}
              placeholder={isBasic ? "Enter the password" : "Enter the token"}
              isError={Boolean(fieldState.error)}
              isUntouched={isUntouched}
              hasStoredSecret={hasStoredSecret}
              canBeCleared={isBasic}
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );

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
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="headerName"
            render={({ field, fieldState }) => (
              <Field className="w-56">
                <FieldLabel>Header Name</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    placeholder="Authorization"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="headerPrefix"
            render={({ field, fieldState }) => (
              <Field className="w-28">
                <FieldLabel>Prefix</FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="Bearer" isError={Boolean(fieldState.error)} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          {secretField}
        </div>
      )}

      {credentialType === AgentVaultCredentialType.Basic && (
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState }) => (
              <Field className="flex-1">
                <FieldLabel>Username</FieldLabel>
                <FieldContent>
                  <SecretInput
                    field={field}
                    label="Username"
                    placeholder="Enter the username"
                    isError={Boolean(fieldState.error)}
                    isUntouched={isUsernameUntouched}
                    hasStoredSecret={hasStoredSecret}
                    canBeCleared
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          {secretField}
        </div>
      )}

      {credentialType !== AgentVaultCredentialType.Passthrough && (
        <CodeBlock
          label="Sends"
          isCopyable={false}
          value={
            credentialPreview(
              { credentialType, headerName, headerPrefix },
              isBasic ? "base64(<username>:<password>)" : "<token>"
            ) ?? ""
          }
        />
      )}

      {credentialType === AgentVaultCredentialType.Passthrough && (
        <Alert variant="info">
          <AlertTitle>No credential is attached</AlertTitle>
          <AlertDescription>
            The proxy forwards requests to these hosts unchanged. Use this when you need a host to
            be reachable through a proxy that would otherwise block it.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
