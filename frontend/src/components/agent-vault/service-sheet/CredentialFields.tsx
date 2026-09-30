import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Controller, ControllerRenderProps, useFormContext } from "react-hook-form";
import { EyeIcon, EyeOffIcon, XIcon } from "lucide-react";

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
import { cn } from "@app/components/v3/utils";
import { isVariableReferenceOnly } from "@app/helpers/agentVaultVariables";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import { SendsPreview } from "./SendsPreview";
import { CREDENTIAL_LABELS, TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";
import { useServiceVariables } from "./ServiceVariablesContext";
import {
  ReferenceHighlights,
  useVariableAutocomplete,
  VariableKeyChips,
  VariableSuggestions
} from "./VariableReferenceInput";

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
  storedKeys
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

  const lowerLabel = label.toLowerCase();

  return (
    <>
      <VariableSuggestions autocomplete={autocomplete}>
        <InputGroup>
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
                if (hasStoredSecret && !field.value && !isCleared) field.onChange(UNCHANGED_SECRET);
                field.onBlur();
              }}
              placeholder={placeholder}
              isError={isError}
            />
          </div>
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
              isDisabled={isUntouched || !field.value || isReferenceOnly}
              aria-label={`${isVisible ? "Hide" : "Show"} ${lowerLabel}`}
              onClick={() => setIsVisible((prev) => !prev)}
            >
              {isVisible ? <EyeOffIcon /> : <EyeIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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

type Props = {
  storedType?: AgentVaultCredentialType;
};

export const CredentialFields = ({ storedType }: Props) => {
  const { control, watch, setValue } = useFormContext<TServiceForm>();
  const { storedKeys } = useServiceVariables();
  const credentialType = watch("credentialType");
  const secret = watch("secret");
  const username = watch("username");

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
              placeholder={
                isBasic ? "Enter the password, or type {{" : "Enter the token, or type {{"
              }
              isError={Boolean(fieldState.error)}
              isUntouched={isUntouched}
              hasStoredSecret={hasStoredSecret}
              canBeCleared={isBasic}
              storedKeys={hasStoredSecret ? storedKeys.secret : undefined}
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
                    placeholder="Enter the username, or type {{"
                    isError={Boolean(fieldState.error)}
                    isUntouched={isUsernameUntouched}
                    hasStoredSecret={hasStoredSecret}
                    canBeCleared
                    storedKeys={hasStoredSecret ? storedKeys.username : undefined}
                  />
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
