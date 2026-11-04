import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Controller, ControllerRenderProps, useFormContext } from "react-hook-form";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  XIcon
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  ButtonGroup,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { isVariableReferenceOnly } from "@app/helpers/agentVaultVariables";
import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "@app/hooks/api/agentVault";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ReferenceHighlights } from "./ReferenceHighlights";
import { SendsPreview } from "./SendsPreview";
import {
  CREDENTIAL_LABELS,
  FORM_FIELD_OF_CREDENTIAL_FIELD,
  HTTP_CREDENTIAL_TYPES,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";
import { useServiceVariables } from "./ServiceVariablesContext";
import { VariableKeyChips } from "./VariableChips";
import { useVariableAutocomplete, VariableSuggestions } from "./VariableSuggestions";

type SecretName =
  | "secret"
  | "username"
  | `customHeaders.${number}.value`
  | `substitutions.${number}.value`;

// Keys the input handles itself while suggestions are open, so they must not re-read the caret after.
const SUGGESTION_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"]);

export const SecretInput = <TName extends SecretName>({
  field,
  label,
  ariaLabel,
  placeholder,
  isError,
  isUntouched,
  hasStoredSecret,
  canBeCleared,
  storedKeys,
  canInsertVariable
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
  /** The keys of the variables the stored value uses, listed under the field while that value is kept. */
  storedKeys?: string[];
  /** Joins a chevron button to the input that opens the variable list, for readers who would not know to type {{. */
  canInsertVariable?: boolean;
}) => {
  const { setFocus } = useFormContext<TServiceForm>();
  const [isVisible, setIsVisible] = useState(false);
  const [isCleared, setIsCleared] = useState(false);
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Where the caret goes after a suggestion is picked. The value is set first, and setting it moves the
  // caret to the end.
  const caretRef = useRef<number | null>(null);

  const value = field.value ?? "";
  const isReferenceOnly = !isUntouched && isVariableReferenceOnly(value);
  // The sentinel must never render as text, and a lone reference holds no secret.
  const isShown = (isVisible && !isUntouched) || isReferenceOnly;
  const isHighlighted = isShown && value.includes("{{");
  // Focusing only empties the box: left empty, it gets the stored value back on blur.
  const isStoredValueKept = isUntouched || (hasStoredSecret && !value && !isCleared);
  const hasStoredKeys = Boolean(storedKeys?.length);

  const autocomplete = useVariableAutocomplete({
    inputRef,
    onInsert: (next, caret) => {
      setIsCleared(false);
      field.onChange(next);
      caretRef.current = caret;
      setIsVisible(true);
    }
  });

  // The sheet is not unmounted between opens, so the flag has to follow the value back to the sentinel.
  useEffect(() => {
    if (isUntouched) setIsCleared(false);
  }, [isUntouched]);

  // A value that starts as a reference stays readable as text is typed around it.
  useEffect(() => {
    if (isReferenceOnly) setIsVisible(true);
  }, [isReferenceOnly]);

  const syncOverlay = () => {
    if (overlayRef.current && inputRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret !== null && inputRef.current) {
      caretRef.current = null;
      inputRef.current.setSelectionRange(caret, caret);
    }
    syncOverlay();
  });

  const showVariables = () => {
    inputRef.current?.focus();
    autocomplete.openPicker();
  };

  const lowerLabel = label.toLowerCase();
  const isClearable = canBeCleared && hasStoredSecret;

  return (
    <>
      <VariableSuggestions autocomplete={autocomplete}>
        <ButtonGroup className="w-full">
          <InputGroup className="flex-1">
            <div className="relative flex min-w-0 flex-1 items-center self-stretch">
              {isHighlighted && <ReferenceHighlights value={value} overlayRef={overlayRef} />}
              <InputGroupInput
                {...field}
                ref={(element) => {
                  field.ref(element);
                  inputRef.current = element;
                }}
                aria-label={ariaLabel}
                aria-describedby={hasStoredKeys && isStoredValueKept ? descriptionId : undefined}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={autocomplete.isOpen}
                aria-controls={autocomplete.isOpen ? autocomplete.listId : undefined}
                aria-activedescendant={autocomplete.activeOptionId}
                // Not type="password": that opens the browser's and password managers' autofill menus over
                // the variable list, so the field is masked in CSS and each manager is told to skip it.
                className={cn(
                  !isShown && "[-webkit-text-security:disc]",
                  isHighlighted && "text-transparent caret-foreground"
                )}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                onChange={(event) => {
                  setIsCleared(false);
                  // An emptied field masks again, since what is typed next may be a real secret.
                  if (!event.target.value) setIsVisible(false);
                  field.onChange(event);
                  autocomplete.refresh();
                }}
                onKeyDown={autocomplete.onKeyDown}
                onKeyUp={(event) => {
                  if (!SUGGESTION_KEYS.has(event.key)) autocomplete.refresh();
                }}
                onClick={autocomplete.refresh}
                onSelect={syncOverlay}
                onScroll={syncOverlay}
                onFocus={() => {
                  if (isUntouched) field.onChange("");
                }}
                // Empty reads the same whether the secret was meant to go or the field was only clicked into,
                // so the clear button is made the one way to say it and passing through loses nothing.
                onBlur={() => {
                  autocomplete.close();
                  if (hasStoredSecret && !field.value && !isCleared)
                    field.onChange(UNCHANGED_SECRET);
                  field.onBlur();
                }}
                placeholder={placeholder}
                isError={isError}
              />
            </div>
            {(isClearable || !isUntouched) && (
              <InputGroupAddon align="inline-end">
                {isClearable && (
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
                {/* A stored credential is never returned, so until it is replaced there is nothing to reveal. */}
                {!isUntouched && (
                  <InputGroupButton
                    isDisabled={!field.value || isReferenceOnly}
                    aria-label={`${isVisible ? "Hide" : "Show"} ${lowerLabel}`}
                    onClick={() => setIsVisible((prev) => !prev)}
                  >
                    {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            )}
          </InputGroup>
          {canInsertVariable && (
            <IconButton variant="outline" aria-label="Show variables" onClick={showVariables}>
              <ChevronDownIcon />
            </IconButton>
          )}
        </ButtonGroup>
      </VariableSuggestions>
      {hasStoredKeys && (
        <FieldDescription
          id={descriptionId}
          isOpen={isStoredValueKept}
          className="flex flex-wrap items-center gap-1"
        >
          Current value uses
          <VariableKeyChips keys={storedKeys ?? []} />
        </FieldDescription>
      )}
    </>
  );
};

const MEMBER_FIELDS_OF_TYPE: Record<AgentVaultCredentialType, TAgentVaultMemberProvidedField[]> = {
  [AgentVaultCredentialType.Bearer]: [AgentVaultVariableReferenceField.CredentialValue],
  [AgentVaultCredentialType.Basic]: [
    AgentVaultVariableReferenceField.CredentialUsername,
    AgentVaultVariableReferenceField.CredentialValue
  ],
  [AgentVaultCredentialType.Passthrough]: [],
  [AgentVaultCredentialType.OAuth]: []
};

const MemberProvidedToggle = ({
  label,
  isOn,
  onChange
}: {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}) => {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <HoverCard openDelay={150} closeDelay={150}>
        <HoverCardTrigger asChild>
          <InfoIcon
            aria-label={`About member-provided ${label.toLowerCase()}s`}
            className="size-3.5 text-muted"
          />
        </HoverCardTrigger>
        <HoverCardContent className="w-80">
          <p>Choose who sets the {label.toLowerCase()} the proxy sends for this service.</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
            <li>Off: you set the {label.toLowerCase()} here, and every session uses it.</li>
            <li>
              On: each member sets their own from the access bundle page, and a session uses the{" "}
              {label.toLowerCase()} of whoever started it, or of the user it was started on behalf
              of.
            </li>
          </ul>
          <a
            href={AgentVaultDocsUrls.memberProvidedValues}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
          >
            Learn more
            <ExternalLinkIcon className="size-3" />
          </a>
        </HoverCardContent>
      </HoverCard>
      <FieldLabel htmlFor={id}>Member provided</FieldLabel>
      <Toggle id={id} size="sm" variant="av" checked={isOn} onCheckedChange={onChange} />
    </div>
  );
};

const MemberProvidedInput = ({ label }: { label: string }) => (
  <InputGroup>
    <InputGroupAddon>
      <LockIcon />
    </InputGroupAddon>
    <InputGroupInput
      disabled
      aria-label={`${label}, set by each member`}
      placeholder="Member provided"
    />
  </InputGroup>
);

type Props = {
  storedType?: AgentVaultCredentialType;
  /** The fields that were member-provided when the sheet opened, which have no stored value behind them. */
  storedMemberFields?: TAgentVaultMemberProvidedField[];
};

export const CredentialFields = ({ storedType, storedMemberFields = [] }: Props) => {
  const { control, watch, setValue, clearErrors } = useFormContext<TServiceForm>();
  const { storedKeys } = useServiceVariables();
  const credentialType = watch("credentialType");
  const secret = watch("secret");
  const username = watch("username");
  const memberProvidedFields = watch("memberProvidedFields");

  const isBasic = credentialType === AgentVaultCredentialType.Basic;
  const isUntouched = secret === UNCHANGED_SECRET;
  const isUsernameUntouched = username === UNCHANGED_SECRET;
  // A stored secret belongs to the type it was saved under, so switching type leaves nothing behind it.
  const hasStoredSecret = Boolean(storedType) && credentialType === storedType;
  // Nor is anything stored for a field each member used to set.
  const hasStoredValue = (field: TAgentVaultMemberProvidedField) =>
    hasStoredSecret && !storedMemberFields.includes(field);
  const isMemberProvided = (field: TAgentVaultMemberProvidedField) =>
    memberProvidedFields.includes(field);
  // A bearer token and a basic password are both credential-value.
  const secretCredentialField = AgentVaultVariableReferenceField.CredentialValue;

  // Saving deletes what members set: all of it on a type change, or one field's when it's taken back.
  const isDeletingAllMemberValues =
    Boolean(storedType) && storedMemberFields.length > 0 && credentialType !== storedType;
  const memberValuesNote = (field: TAgentVaultMemberProvidedField, label: string) =>
    storedType === credentialType &&
    storedMemberFields.includes(field) &&
    !isMemberProvided(field) && (
      <FieldDescription>
        Members&apos; saved {label.toLowerCase()}s are deleted when you save.
      </FieldDescription>
    );

  useEffect(() => {
    if (!storedType || credentialType === storedType) return;
    if (isUntouched) setValue("secret", "");
    if (isUsernameUntouched) setValue("username", "");
  }, [isUntouched, isUsernameUntouched, credentialType, storedType, setValue]);

  // Which fields a member can set depends on the type, so a switch drops the ones the new type lacks.
  useEffect(() => {
    const valid = memberProvidedFields.filter((field) =>
      MEMBER_FIELDS_OF_TYPE[credentialType].includes(field)
    );
    if (valid.length !== memberProvidedFields.length) setValue("memberProvidedFields", valid);
  }, [credentialType, memberProvidedFields, setValue]);

  // Switching away and back to the stored type changes nothing, so the stored values and toggles come back as they
  // were rather than staying cleared by the switch.
  const previousType = useRef(credentialType);
  useEffect(() => {
    const wasType = previousType.current;
    previousType.current = credentialType;
    if (!storedType || wasType === credentialType || credentialType !== storedType) return;
    setValue("memberProvidedFields", storedMemberFields);
    if (!storedMemberFields.includes(secretCredentialField)) setValue("secret", UNCHANGED_SECRET);
    if (
      credentialType === AgentVaultCredentialType.Basic &&
      !storedMemberFields.includes(AgentVaultVariableReferenceField.CredentialUsername)
    ) {
      setValue("username", UNCHANGED_SECRET);
    }
  }, [credentialType, storedType, storedMemberFields, secretCredentialField, setValue]);

  // Handing a field to members drops what was typed for it. Taking it back restores what is stored, if anything.
  const setMemberProvided = (field: TAgentVaultMemberProvidedField, isOn: boolean) => {
    const formField = FORM_FIELD_OF_CREDENTIAL_FIELD[field];
    setValue(
      "memberProvidedFields",
      isOn
        ? [...memberProvidedFields, field]
        : memberProvidedFields.filter((existing) => existing !== field),
      { shouldDirty: true }
    );
    setValue(formField, !isOn && hasStoredValue(field) ? UNCHANGED_SECRET : "", {
      shouldDirty: true
    });
    clearErrors([formField, "username"]);
  };

  const fieldLabel = (label: string, field: TAgentVaultMemberProvidedField) => (
    <div className="flex items-center justify-between gap-2">
      <FieldLabel>{label}</FieldLabel>
      <MemberProvidedToggle
        label={label}
        isOn={isMemberProvided(field)}
        onChange={(isOn) => setMemberProvided(field, isOn)}
      />
    </div>
  );

  const secretLabel = isBasic ? "Password" : "Token";
  const secretField = (
    <Controller
      control={control}
      name="secret"
      render={({ field, fieldState }) => (
        <Field className="flex-1">
          {fieldLabel(secretLabel, secretCredentialField)}
          <FieldContent>
            {isMemberProvided(secretCredentialField) ? (
              <MemberProvidedInput label={secretLabel} />
            ) : (
              <SecretInput
                field={field}
                label={secretLabel}
                placeholder={
                  isBasic ? "Enter the password, or type {{" : "Enter the token, or type {{"
                }
                isError={Boolean(fieldState.error)}
                isUntouched={isUntouched}
                hasStoredSecret={hasStoredValue(secretCredentialField)}
                canBeCleared={isBasic}
                storedKeys={hasStoredValue(secretCredentialField) ? storedKeys.secret : undefined}
              />
            )}
            {memberValuesNote(secretCredentialField, secretLabel)}
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
                  {HTTP_CREDENTIAL_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CREDENTIAL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isDeletingAllMemberValues && (
                <FieldDescription>
                  Members&apos; saved values for this service are deleted when you save.
                </FieldDescription>
              )}
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
                {fieldLabel("Username", AgentVaultVariableReferenceField.CredentialUsername)}
                <FieldContent>
                  {isMemberProvided(AgentVaultVariableReferenceField.CredentialUsername) ? (
                    <MemberProvidedInput label="Username" />
                  ) : (
                    <SecretInput
                      field={field}
                      label="Username"
                      placeholder="Enter the username, or type {{"
                      isError={Boolean(fieldState.error)}
                      isUntouched={isUsernameUntouched}
                      hasStoredSecret={hasStoredValue(
                        AgentVaultVariableReferenceField.CredentialUsername
                      )}
                      canBeCleared
                      storedKeys={
                        hasStoredValue(AgentVaultVariableReferenceField.CredentialUsername)
                          ? storedKeys.username
                          : undefined
                      }
                    />
                  )}
                  {memberValuesNote(
                    AgentVaultVariableReferenceField.CredentialUsername,
                    "Username"
                  )}
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          {secretField}
        </div>
      )}

      {credentialType !== AgentVaultCredentialType.Passthrough && <SendsPreview />}

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
