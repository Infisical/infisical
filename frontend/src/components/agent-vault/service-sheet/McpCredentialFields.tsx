import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { SecretInput } from "./CredentialFields";
import { OAuthAuthorizeCard } from "./OAuthAuthorizeCard";
import { SendsPreview } from "./SendsPreview";
import { TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";
import { useServiceVariables } from "./ServiceVariablesContext";
import { TransformationsFields } from "./TransformationsFields";

const AUTH_METHOD_OPTIONS = [
  {
    type: AgentVaultCredentialType.OAuth,
    icon: ShieldCheckIcon,
    title: "OAuth 2.1",
    description: "Authorize once. Infisical stores the token and keeps it fresh."
  },
  {
    type: AgentVaultCredentialType.Bearer,
    icon: KeyRoundIcon,
    title: "Bearer Token",
    description: "A token you provide, sent in a header on every request to the server."
  }
] as const;

type Props = {
  accessBundleId: string;
  service?: TAgentVaultService | null;
  openItem: string;
  onOpenChange: (item: string) => void;
};

export const McpCredentialFields = ({ accessBundleId, service, openItem, onOpenChange }: Props) => {
  const { control, watch, setValue, clearErrors } = useFormContext<TServiceForm>();
  const { storedKeys } = useServiceVariables();
  const secret = watch("secret");
  const credentialType = watch("credentialType");
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

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel id={authMethodLabelId}>Auth Method</FieldLabel>
        <FieldContent>
          <RadioGroup
            aria-labelledby={authMethodLabelId}
            value={isOAuth ? AgentVaultCredentialType.OAuth : AgentVaultCredentialType.Bearer}
            onValueChange={(value) => selectType(value as AgentVaultCredentialType)}
            className="gap-3 md:grid-cols-2"
          >
            {AUTH_METHOD_OPTIONS.map(({ type, icon: Icon, title, description }) => {
              const id = `${authMethodLabelId}-${type}`;
              return (
                <FieldLabel key={type} htmlFor={id} variant="av">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>
                        <Icon />
                        {title}
                      </FieldTitle>
                      <FieldDescription>{description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem id={id} value={type} />
                  </Field>
                </FieldLabel>
              );
            })}
          </RadioGroup>
        </FieldContent>
      </Field>

      {isOAuth ? (
        <OAuthAuthorizeCard accessBundleId={accessBundleId} service={service} />
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

      <SendsPreview />

      <TransformationsFields
        openItem={openItem}
        onOpenChange={onOpenChange}
        label="Advanced"
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
