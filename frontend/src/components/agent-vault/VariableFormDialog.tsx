import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import {
  normalizeVariableKey,
  toVariableReference,
  VARIABLE_KEY_MAX_LENGTH,
  VARIABLE_KEY_MESSAGE,
  VARIABLE_KEY_RE,
  VARIABLE_VALUE_MAX_LENGTH
} from "@app/helpers/agentVaultVariables";
import { useDebounce } from "@app/hooks";
import {
  AgentVaultVariableScope,
  useAgentVaultVariableKeyStatus,
  useCreateAgentVaultVariable,
  useUpdateAgentVaultVariable
} from "@app/hooks/api/agentVault";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

// zod reports a refine as "custom", and the taken-key check is the key's only one, so this tells a taken key apart
// from the key's other errors. The API's duplicate is flagged with it too.
const TAKEN_KEY_ERROR_TYPE = "custom";

// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

// A stored value never comes back, so on edit its field starts empty and empty keeps it. Taken keys are read
// when the form validates, as the lookup of the typed key answers after it was typed.
const buildSchema = (
  getTakenKeys: () => ReadonlySet<string>,
  isValueRequired: boolean,
  isPersonal: boolean
) =>
  z.object({
    key: z
      .string()
      .min(1, "Required")
      .max(VARIABLE_KEY_MAX_LENGTH, `A key can be at most ${VARIABLE_KEY_MAX_LENGTH} characters.`)
      .regex(VARIABLE_KEY_RE, VARIABLE_KEY_MESSAGE)
      .refine(
        (key) => !getTakenKeys().has(key),
        (key) => ({
          message: isPersonal
            ? `You already have a variable named '${key}'.`
            : `A variable named '${key}' already exists.`
        })
      ),
    value: z
      .string()
      .max(
        VARIABLE_VALUE_MAX_LENGTH,
        `A value can be at most ${VARIABLE_VALUE_MAX_LENGTH} characters.`
      )
      .regex(
        NO_CONTROL_CHARS_RE,
        "A value can't contain line breaks or other control characters. Check for a stray newline if you pasted it."
      )
      .refine((value) => !isValueRequired || value.length > 0, "Required")
      .refine((value) => !value || value.trim().length > 0, "A value can't be only spaces.")
  });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  variable?: TAgentVaultVariable | null;
  /** A key to start a new variable from, as when it was named in a service before it existed. */
  initialKey?: string;
  onCreated?: (variable: TAgentVaultVariable) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /** Personal for one of the caller's own variables, which only their personal values use. */
  scope?: AgentVaultVariableScope;
};

// Mounted with the dialog's content, which unmounts while the dialog is closed, so every open starts from a fresh
// form: no key, lookup or error is carried over from the last one.
const VariableForm = ({
  isOpen,
  onOpenChange,
  variable,
  initialKey,
  onCreated,
  scope = AgentVaultVariableScope.Global
}: Omit<Props, "onCloseAutoFocus">) => {
  const isPersonal = scope === AgentVaultVariableScope.Personal;
  const createVariable = useCreateAgentVaultVariable();
  const updateVariable = useUpdateAgentVaultVariable();
  const isUpdate = Boolean(variable);
  const usedByCount = variable?.usedByServices.length ?? 0;
  const [isValueVisible, setIsValueVisible] = useState(false);

  const takenKeysRef = useRef<ReadonlySet<string>>(new Set());
  const schema = useMemo(
    () => buildSchema(() => takenKeysRef.current, !variable, isPersonal),
    [variable, isPersonal]
  );

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    setFocus,
    trigger,
    getFieldState,
    formState: { isDirty, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { key: variable?.key ?? initialKey ?? "", value: "" }
  });

  const key = useWatch({ control, name: "key" });

  // Asked of the server each time typing pauses, never from a cache, since another admin can add or delete the key
  // at any time. A duplicate saved before the answer arrives is refused by the API and flagged under the field.
  const [debouncedKey] = useDebounce(key ?? "", 300);
  const lookupKey =
    isOpen &&
    !isSubmitting &&
    debouncedKey === key &&
    VARIABLE_KEY_RE.test(key) &&
    key !== variable?.key
      ? key
      : null;
  const { existing } = useAgentVaultVariableKeyStatus(lookupKey ? [lookupKey] : [], {
    isCached: false,
    scope
  });
  takenKeysRef.current = existing;
  // Re-checked when the answer flags the key, and when a key that was flagged is changed, so the message comes
  // and goes with the lookup rather than waiting for a submit. A key that is never looked up (empty, malformed, or
  // the variable's own) can't be taken, so a taken-key message goes once it settles there. Its other errors stay
  // until the form validates again.
  const isKeySettled = debouncedKey === key;
  useEffect(() => {
    if (!isOpen || isSubmitting || !isKeySettled) return;
    if (lookupKey) {
      if (existing.has(lookupKey) || getFieldState("key").error) trigger("key");
      return;
    }
    if (getFieldState("key").error?.type === TAKEN_KEY_ERROR_TYPE) clearErrors("key");
  }, [
    isOpen,
    isSubmitting,
    isKeySettled,
    lookupKey,
    existing,
    trigger,
    getFieldState,
    clearErrors
  ]);
  const isRenaming = Boolean(variable) && Boolean(key) && key !== variable?.key;

  // A key that arrives filled in leaves the value as the one thing left to type.
  useEffect(() => {
    if (initialKey) setFocus("value");
  }, [initialKey, setFocus]);

  const onSubmit = async (data: FormData) => {
    try {
      if (variable) {
        await updateVariable.mutateAsync({
          variableId: variable.id,
          key: data.key === variable.key ? undefined : data.key,
          value: data.value.length > 0 ? data.value : undefined
        });
        createNotification({ text: `Variable "${data.key}" updated`, type: "success" });
      } else {
        const created = await createVariable.mutateAsync({
          scope,
          key: data.key,
          value: data.value
        });
        onCreated?.(created);
        createNotification({ text: `Variable "${data.key}" created`, type: "success" });
      }
      onOpenChange(false);
    } catch (error) {
      // The global request handler toasts every failure. A duplicate key is also shown on the field it concerns.
      const serverResponse = axios.isAxiosError(error)
        ? (error.response?.data as TApiErrors | undefined)
        : undefined;
      if (
        serverResponse?.error === ApiErrorTypes.BadRequestError &&
        (serverResponse.details as { field?: string } | undefined)?.field === "key"
      ) {
        setError("key", { type: TAKEN_KEY_ERROR_TYPE, message: serverResponse.message });
      }
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isUpdate ? "Edit" : "Add"} {isPersonal ? "Personal" : "Global"} Variable
        </DialogTitle>
        <DialogDescription>
          {isPersonal
            ? "Store a value once and reuse it for any service that asks you for a value. Only you can read it."
            : "Store a value once and use it from any service in any access bundle. Only admins can manage it and see its value."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Controller
          control={control}
          name="key"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Key</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  onChange={(event) => field.onChange(normalizeVariableKey(event.target.value))}
                  placeholder="GITHUB_TOKEN"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  isError={Boolean(fieldState.error)}
                />
                <FieldDescription>
                  {isRenaming && usedByCount > 0 ? (
                    <>
                      {usedByCount === 1
                        ? "The service that uses it keeps working"
                        : `The ${usedByCount} services that use it keep working`}{" "}
                      under the new key.
                    </>
                  ) : (
                    <>
                      {isPersonal ? "Your personal values use" : "Services use"} it as{" "}
                      <code className="font-mono">{toVariableReference(key || "KEY")}</code>.
                    </>
                  )}
                </FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="value"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Value</FieldLabel>
              <FieldContent>
                <InputGroup>
                  <InputGroupInput
                    {...field}
                    type={isValueVisible ? "text" : "password"}
                    placeholder={
                      variable ? "Leave blank to keep the current value" : "Enter the value"
                    }
                    autoComplete="off"
                    spellCheck={false}
                    isError={Boolean(fieldState.error)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      isDisabled={!field.value}
                      aria-label={isValueVisible ? "Hide value" : "Show value"}
                      onClick={() => setIsValueVisible((prev) => !prev)}
                    >
                      {isValueVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="av"
            isPending={isSubmitting}
            isDisabled={isUpdate && !isDirty}
          >
            {isUpdate ? "Save" : `Add ${isPersonal ? "Personal" : "Global"} Variable`}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
};

export const VariableFormDialog = ({
  isOpen,
  onOpenChange,
  onCloseAutoFocus,
  ...formProps
}: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent
      // The form focuses the value itself when the key arrives filled in.
      onOpenAutoFocus={(event) => {
        if (formProps.initialKey) event.preventDefault();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <VariableForm isOpen={isOpen} onOpenChange={onOpenChange} {...formProps} />
    </DialogContent>
  </Dialog>
);
