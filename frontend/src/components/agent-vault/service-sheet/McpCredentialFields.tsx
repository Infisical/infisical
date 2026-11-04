import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
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
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { SecretInput } from "./CredentialFields";
import { OAuthAuthorizeCard } from "./OAuthAuthorizeCard";
import { SendsPreview } from "./SendsPreview";
import { TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";
import { useServiceVariables } from "./ServiceVariablesContext";
import { TransformationsFields } from "./TransformationsFields";

const AUTH_METHOD_LABELS = {
  [AgentVaultCredentialType.OAuth]: "OAuth",
  [AgentVaultCredentialType.Bearer]: "Bearer Token"
} as const;

const DEFAULT_HEADER_NAME = "Authorization";
const DEFAULT_HEADER_PREFIX = "Bearer";

type Props = {
  accessBundleId: string;
  service?: TAgentVaultService | null;
  openItem: string;
  onOpenChange: (item: string) => void;
  onSignInChange?: (isSigningIn: boolean) => void;
};

export const McpCredentialFields = ({
  accessBundleId,
  service,
  openItem,
  onOpenChange,
  onSignInChange
}: Props) => {
  const { control, watch, setValue, clearErrors } = useFormContext<TServiceForm>();
  const { storedKeys } = useServiceVariables();
  const secret = watch("secret");
  const credentialType = watch("credentialType");
  const headerName = watch("headerName");
  const headerPrefix = watch("headerPrefix");
  const customHeaders = watch("customHeaders");
  const isOAuth = credentialType === AgentVaultCredentialType.OAuth;
  const authMethodLabelId = useId();
  const headerNameInputId = useId();
  const headerPrefixInputId = useId();
  const storedType = service?.credential.type;

  const selectType = (type: AgentVaultCredentialType) => {
    if (type === credentialType) return;
    setValue("credentialType", type, { shouldDirty: true });
    clearErrors(["secret", "oauthAuthorizationId", "headerName", "headerPrefix"]);
  };

  const hasStoredSecret = storedType === AgentVaultCredentialType.Bearer;
  const trimmedHeaderName = (headerName ?? "").trim();
  // The default Authorization: Bearer header needs no preview; it earns one once something is customized.
  const isHeaderCustomized =
    !isOAuth &&
    ((trimmedHeaderName && trimmedHeaderName.toLowerCase() !== DEFAULT_HEADER_NAME.toLowerCase()) ||
      (headerPrefix ?? "").trim() !== DEFAULT_HEADER_PREFIX);
  const showSends = isHeaderCustomized || customHeaders.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel id={authMethodLabelId}>Credential Type</FieldLabel>
        <FieldContent>
          <Select
            value={isOAuth ? AgentVaultCredentialType.OAuth : AgentVaultCredentialType.Bearer}
            onValueChange={(value) => selectType(value as AgentVaultCredentialType)}
          >
            <SelectTrigger aria-labelledby={authMethodLabelId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {Object.entries(AUTH_METHOD_LABELS).map(([type, label]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>

      {isOAuth ? (
        <OAuthAuthorizeCard
          accessBundleId={accessBundleId}
          service={service}
          onSignInChange={onSignInChange}
        />
      ) : (
        <Controller
          control={control}
          name="secret"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Token</FieldLabel>
              <FieldContent>
                <SecretInput
                  field={field}
                  label="Token"
                  ariaLabel="Token"
                  placeholder="Enter the token, or type {{"
                  isError={Boolean(fieldState.error)}
                  isUntouched={secret === UNCHANGED_SECRET}
                  hasStoredSecret={hasStoredSecret}
                  canBeCleared={false}
                  storedKeys={hasStoredSecret ? storedKeys.secret : undefined}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {showSends && <SendsPreview />}

      <TransformationsFields
        openItem={openItem}
        onOpenChange={onOpenChange}
        hasSubstitutions={false}
      >
        {!isOAuth && (
          <div className="flex items-start gap-3">
            <Controller
              control={control}
              name="headerName"
              render={({ field, fieldState }) => (
                <Field className="flex-1">
                  <FieldLabel htmlFor={headerNameInputId}>Header Name</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id={headerNameInputId}
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
                <Field className="w-40">
                  <FieldLabel htmlFor={headerPrefixInputId}>Prefix</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id={headerPrefixInputId}
                      placeholder="Bearer"
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
          </div>
        )}
      </TransformationsFields>
    </div>
  );
};
