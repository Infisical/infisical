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
import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { MemberProvidedInput, MemberProvidedToggle, SecretInput } from "./CredentialFields";
import { OAuthAuthorizeCard } from "./OAuthAuthorizeCard";
import { OAuthVariableField } from "./OAuthVariableField";
import { SendsPreview } from "./SendsPreview";
import {
  isCredentialMemberProvided,
  memberFieldsAfterTypeSwitch,
  storedMemberFields,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";
import { useServiceVariables } from "./ServiceVariablesContext";
import { TransformationsFields } from "./TransformationsFields";

const AUTH_METHOD_LABELS = {
  [AgentVaultCredentialType.OAuth]: "OAuth",
  [AgentVaultCredentialType.Bearer]: "Bearer Token"
} as const;

enum OAuthSource {
  ConnectHere = "connect-here",
  Variable = "variable"
}

const OAUTH_SOURCE_LABELS: Record<OAuthSource, string> = {
  [OAuthSource.ConnectHere]: "Connect Here",
  [OAuthSource.Variable]: "Use an OAuth Variable"
};

const DEFAULT_HEADER_NAME = "Authorization";
const DEFAULT_HEADER_PREFIX = "Bearer";

type Props = {
  projectId: string;
  service?: TAgentVaultService | null;
  openItem: string;
  onOpenChange: (item: string) => void;
  onSignInChange?: (isSigningIn: boolean) => void;
};

export const McpCredentialFields = ({
  projectId,
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
  const memberProvidedFields = watch("memberProvidedFields");
  const oauthUsesVariable = watch("oauthUsesVariable");
  const isOAuth = credentialType === AgentVaultCredentialType.OAuth;
  const isMemberProvided = isCredentialMemberProvided({ memberProvidedFields });
  const authMethodLabelId = useId();
  const oauthSourceLabelId = useId();
  const headerNameInputId = useId();
  const headerPrefixInputId = useId();
  const storedType = service?.credential.type;
  const storedFields = storedMemberFields(service);

  const selectType = (type: AgentVaultCredentialType) => {
    if (type === credentialType) return;
    setValue("credentialType", type, { shouldDirty: true });
    setValue(
      "memberProvidedFields",
      memberFieldsAfterTypeSwitch(type, service, Boolean(oauthUsesVariable)),
      { shouldDirty: true }
    );
    clearErrors(["secret", "oauthAuthorizationId", "headerName", "headerPrefix"]);
  };

  // Nothing is stored behind a token each member used to set.
  const hasStoredSecret = storedType === AgentVaultCredentialType.Bearer && !storedFields.length;

  const setMemberProvided = (isOn: boolean) => {
    setValue(
      "memberProvidedFields",
      isOn ? [AgentVaultVariableReferenceField.CredentialValue] : [],
      { shouldDirty: true }
    );
    if (!isOAuth) {
      setValue("secret", !isOn && hasStoredSecret ? UNCHANGED_SECRET : "", { shouldDirty: true });
    }
    clearErrors(["secret", "oauthAuthorizationId", "oauthClientId", "oauthClientSecret"]);
  };
  // An OAuth variable's sign-in is shared, so choosing one turns member-provided off.
  const selectOAuthSource = (source: OAuthSource) => {
    const usesVariable = source === OAuthSource.Variable;
    if (usesVariable === oauthUsesVariable) return;
    setValue("oauthUsesVariable", usesVariable, { shouldDirty: true });
    if (usesVariable) setValue("memberProvidedFields", [], { shouldDirty: true });
    clearErrors(["oauthAuthorizationId", "oauthVariableKey", "oauthClientId", "oauthClientSecret"]);
  };

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

      {isOAuth && !isMemberProvided && (
        <Field>
          <FieldLabel id={oauthSourceLabelId}>Sign-in</FieldLabel>
          <FieldContent>
            <Select
              value={oauthUsesVariable ? OAuthSource.Variable : OAuthSource.ConnectHere}
              onValueChange={(value) => selectOAuthSource(value as OAuthSource)}
            >
              <SelectTrigger aria-labelledby={oauthSourceLabelId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.values(OAuthSource).map((source) => (
                  <SelectItem key={source} value={source}>
                    {OAUTH_SOURCE_LABELS[source]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
      )}

      {isOAuth && oauthUsesVariable && (
        <OAuthVariableField projectId={projectId} service={service} />
      )}

      {isOAuth && !oauthUsesVariable && (
        <OAuthAuthorizeCard
          projectId={projectId}
          service={service}
          onSignInChange={onSignInChange}
          isMemberProvided={isMemberProvided}
          onMemberProvidedChange={setMemberProvided}
        />
      )}

      {!isOAuth && (
        <Controller
          control={control}
          name="secret"
          render={({ field, fieldState }) => (
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>Token</FieldLabel>
                <MemberProvidedToggle
                  label="Token"
                  isOn={isMemberProvided}
                  onChange={setMemberProvided}
                  docsUrl={AgentVaultDocsUrls.mcpMemberProvidedCredential}
                />
              </div>
              <FieldContent>
                {isMemberProvided ? (
                  <MemberProvidedInput label="Token" />
                ) : (
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
                )}
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
