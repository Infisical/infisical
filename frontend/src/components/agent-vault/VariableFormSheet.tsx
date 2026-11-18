import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { EyeIcon, EyeOffIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
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
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { AGENT_VAULT_NO_CONTROL_CHARS_RE } from "@app/helpers/agentVaultControlChars";
import {
  normalizeVariableKey,
  toVariableReference,
  VARIABLE_KEY_MAX_LENGTH,
  VARIABLE_KEY_MESSAGE,
  VARIABLE_KEY_RE,
  VARIABLE_VALUE_MAX_LENGTH
} from "@app/helpers/agentVaultVariables";
import { useDebounce, useDiscardChangesGuard } from "@app/hooks";
import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthStatus,
  AgentVaultVariableScope,
  AgentVaultVariableType,
  useAgentVaultVariableKeyStatus,
  useCreateAgentVaultVariable,
  useUpdateAgentVaultVariable
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultOauthVariableSignInStart,
  TAgentVaultVariable
} from "@app/hooks/api/agentVault/types";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

import { OAuthVariableFields } from "./OAuthVariableFields";
import {
  BLANK_OAUTH_VARIABLE_FORM,
  buildOAuthVariableSettings,
  buildOAuthVariableSettingsUpdate,
  changedVariableFormFields,
  CREATE_OAUTH_VARIABLE_TITLE,
  isOAuthVariableSignInChanged,
  parseOAuthScopes,
  oauthVariableFormIssues,
  oauthVariableFormValuesOf,
  TVariableFormValues
} from "./oauthVariableForm";

// zod reports a refine as "custom", and the taken-key check is the key's only one, so this tells a taken key apart
// from the key's other errors. The API's duplicate is flagged with it too.
const TAKEN_KEY_ERROR_TYPE = "custom";

const TYPE_LABELS: Record<AgentVaultVariableType, string> = {
  [AgentVaultVariableType.Text]: "Text",
  [AgentVaultVariableType.OAuth]: "OAuth"
};

// A stored value never comes back, so on edit its field starts empty and empty keeps it. Taken keys are read
// when the form validates, as the lookup of the typed key answers after it was typed.
const buildSchema = (
  getTakenKeys: () => ReadonlySet<string>,
  isValueRequired: boolean,
  isPersonal: boolean
) =>
  z
    .object({
      type: z.nativeEnum(AgentVaultVariableType),
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
      value: z.string(),
      serverUrl: z.string(),
      scopes: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
      authorizationEndpoint: z.string(),
      tokenEndpoint: z.string(),
      issuer: z.string(),
      tokenEndpointAuthMethod: z.union([
        z.nativeEnum(AgentVaultOauthClientAuthMethod),
        z.literal("")
      ]),
      clientName: z.string(),
      redirectUri: z.string()
    })
    .superRefine((data, ctx) => {
      const issue = (path: keyof TVariableFormValues, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if (data.type === AgentVaultVariableType.OAuth) {
        const issues = oauthVariableFormIssues(data);
        issues.forEach(({ field, message }) => issue(field, message));
        return;
      }
      const { value } = data;
      if (value.length > VARIABLE_VALUE_MAX_LENGTH) {
        issue("value", `A value can be at most ${VARIABLE_VALUE_MAX_LENGTH} characters.`);
      } else if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(value)) {
        issue(
          "value",
          "A value can't contain line breaks or other control characters. Check for a stray newline if you pasted it."
        );
      } else if (isValueRequired && value.length === 0) {
        issue("value", "Required");
      } else if (value && value.trim().length === 0) {
        issue("value", "A value can't be only spaces.");
      }
    });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

export type TVariableFormProps = {
  isOpen: boolean;
  variable?: TAgentVaultVariable | null;
  /** A key to start a new variable from, as when it was named in a service before it existed. */
  initialKey?: string;
  /** Fixes the type of a new variable, as for a picker that lists only OAuth variables. */
  type?: AgentVaultVariableType;
  /** A sign-in started from the variables list that needs more settings before it can go ahead. */
  signInStart?: TAgentVaultOauthVariableSignInStart | null;
  /** Called with the new variable once it is created, and again after each later save of it in the same form. */
  onCreated?: (variable: TAgentVaultVariable) => void;
  /** Called once the form has saved, or finished. */
  onClose: () => void;
  /** Cancel and Close, which leave without saving. Defaults to onClose. */
  onCancel?: () => void;
  /** True while a save or a sign-in is in progress, when closing would drop it. */
  onPendingChange?: (isPending: boolean) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  /** Personal for one of the caller's own variables, which only their personal values use. */
  scope?: AgentVaultVariableScope;
  /** Renders the dialog's title and description, which follow the type chosen. Off where the overlay has its own. */
  showHeader?: boolean;
};

export const variableFormTitle = ({
  variable,
  type,
  scope = AgentVaultVariableScope.Global
}: Pick<TVariableFormProps, "variable" | "type" | "scope">) => {
  if (type === AgentVaultVariableType.OAuth && !variable) return CREATE_OAUTH_VARIABLE_TITLE;
  const scopeLabel = scope === AgentVaultVariableScope.Personal ? "Personal" : "Global";
  return `${variable ? "Edit" : "Add"} ${scopeLabel} Variable`;
};

export const variableFormDescription = ({
  variable,
  type,
  scope = AgentVaultVariableScope.Global
}: Pick<TVariableFormProps, "variable" | "type" | "scope">) => {
  if ((variable?.type ?? type) === AgentVaultVariableType.OAuth) {
    return "Sign in once and use the sign-in as the credential of any HTTP API or MCP server.";
  }
  return scope === AgentVaultVariableScope.Personal
    ? "Store a value once and reuse it for any service that asks you for a value. Only you can read it."
    : "Store a value once and use it from any service in any access bundle. Managing it and seeing its value each take their own permission.";
};

// Mounted with the overlay's content, which unmounts while the overlay is closed, so every open starts from a fresh
// form: no key, lookup or error is carried over from the last one.
export const VariableForm = ({
  isOpen,
  variable,
  initialKey,
  type: fixedType,
  signInStart,
  onCreated,
  onClose,
  onCancel = onClose,
  onPendingChange,
  onDirtyChange,
  scope = AgentVaultVariableScope.Global,
  showHeader = false
}: TVariableFormProps) => {
  const { projectId } = useProject();
  const isPersonal = scope === AgentVaultVariableScope.Personal;
  const createVariable = useCreateAgentVaultVariable(projectId);
  const updateVariable = useUpdateAgentVaultVariable(projectId);
  const typeLabelId = useId();
  const [isValueVisible, setIsValueVisible] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  // The variable as last saved: an OAuth sign-in saves it first, so a new one can exist before the dialog closes.
  const [saved, setSaved] = useState<TAgentVaultVariable | null>(variable ?? null);
  const isCreatedHere = !variable && Boolean(saved);
  const isUpdate = Boolean(saved);
  const usedByCount = saved?.usedByServices.length ?? 0;
  // A text variable created from a reference, or a personal one, can only be text.
  const canChooseType = !variable && !fixedType && !isPersonal && !initialKey;

  const takenKeysRef = useRef<ReadonlySet<string>>(new Set());
  const schema = useMemo(
    () => buildSchema(() => takenKeysRef.current, !variable, isPersonal),
    [variable, isPersonal]
  );

  const formMethods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: variable?.type ?? fixedType ?? AgentVaultVariableType.Text,
      key: variable?.key ?? initialKey ?? "",
      value: "",
      ...(variable ? oauthVariableFormValuesOf(variable.oauth) : BLANK_OAUTH_VARIABLE_FORM)
    }
  });
  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    setFocus,
    trigger,
    getFieldState,
    getValues,
    setValue,
    reset,
    formState: { isDirty, isSubmitting }
  } = formMethods;

  const [key, type, clientSecret] = useWatch({ control, name: ["key", "type", "clientSecret"] });
  const formValues = useWatch({ control }) as TVariableFormValues;
  const isOAuth = type === AgentVaultVariableType.OAuth;
  // The API takes a client secret only with a sign-in, so saving one typed here would drop it.
  const isSecretUnsent = isOAuth && Boolean(clientSecret);
  // The API disconnects a variable whose sign-in settings change, and every service on it with it.
  const savedOAuth = saved?.oauth;
  const isSignOutOnSave = Boolean(
    isOAuth &&
    savedOAuth &&
    savedOAuth.status !== AgentVaultOauthStatus.NotConnected &&
    isOAuthVariableSignInChanged(savedOAuth, formValues)
  );

  // The footer starts the sign-in, since for an OAuth variable that is the step that finishes it.
  const authorizeRef = useRef<(() => void) | null>(null);
  const registerAuthorize = useCallback((authorize: () => void) => {
    authorizeRef.current = authorize;
  }, []);
  const [canStartSignIn, setCanStartSignIn] = useState(false);
  const isConnected = savedOAuth?.status === AgentVaultOauthStatus.Connected;
  const hasConnection = Boolean(
    savedOAuth && savedOAuth.status !== AgentVaultOauthStatus.NotConnected
  );
  // Scopes take effect only at the next sign-in, so changing them needs one as much as a sign-in setting does.
  const isSignInEdit = Boolean(
    savedOAuth &&
    (isOAuthVariableSignInChanged(savedOAuth, formValues) ||
      parseOAuthScopes(formValues.scopes ?? "").join(" ") !== savedOAuth.scopes.join(" ") ||
      clientSecret)
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  const changeSigningIn = useCallback(
    (isPending: boolean) => {
      setIsSigningIn(isPending);
      onPendingChange?.(isPending);
    },
    [onPendingChange]
  );
  // A sign-in in this editor doesn't come back through a save, so the saved view would still say not connected.
  const markSavedConnected = useCallback(() => {
    setSaved((current) =>
      current?.oauth
        ? { ...current, oauth: { ...current.oauth, status: AgentVaultOauthStatus.Connected } }
        : current
    );
  }, []);

  // Asked of the server each time typing pauses, never from a cache, since another admin can add or delete the key
  // at any time. A duplicate saved before the answer arrives is refused by the API and flagged under the field.
  const [debouncedKey] = useDebounce(key ?? "", 300);
  const lookupKey =
    isOpen &&
    !isSubmitting &&
    debouncedKey === key &&
    VARIABLE_KEY_RE.test(key) &&
    key !== saved?.key
      ? key
      : null;
  const { existing } = useAgentVaultVariableKeyStatus(projectId, lookupKey ? [lookupKey] : [], {
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
  const isRenaming = Boolean(saved) && Boolean(key) && key !== saved?.key;

  // A key that arrives filled in leaves the value as the one thing left to type.
  useEffect(() => {
    if (initialKey) setFocus("value");
  }, [initialKey, setFocus]);

  const flagServerKeyError = (error: unknown) => {
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
  };

  const saveOAuth = async (data: FormData): Promise<TAgentVaultVariable> => {
    if (!saved) {
      const created = await createVariable.mutateAsync({
        scope: AgentVaultVariableScope.Global,
        type: AgentVaultVariableType.OAuth,
        key: data.key,
        oauth: buildOAuthVariableSettings(data)
      });
      return created;
    }
    const oauth = saved.oauth ? buildOAuthVariableSettingsUpdate(saved.oauth, data) : undefined;
    const keyChange = data.key === saved.key ? undefined : data.key;
    if (!oauth && !keyChange) return saved;
    return updateVariable.mutateAsync({ variableId: saved.id, key: keyChange, oauth });
  };

  // An OAuth sign-in saves first, then signs in, so what is saved becomes the form's new starting point. Anything
  // typed while it saved stays on screen and still counts as a change.
  const persistOAuth = async (data: FormData) => {
    try {
      const result = await saveOAuth(data);
      setSaved(result);
      if (!variable) onCreated?.(result);
      reset(data, { keepValues: true });
      const current = getValues();
      changedVariableFormFields(data, current).forEach((field) =>
        setValue(field, current[field], { shouldDirty: true })
      );
      return result;
    } catch (error) {
      flagServerKeyError(error);
      throw error;
    }
  };

  const getValidValues = () => {
    const values = getValues();
    const result = schema.safeParse(values);
    clearErrors();
    if (result.success) return values;
    result.error.issues.forEach((issue) => {
      const field = issue.path[0] as keyof FormData;
      if (!getFieldState(field).error)
        setError(field, { type: issue.code, message: issue.message });
    });
    return null;
  };

  const onSubmit = async (data: FormData) => {
    onPendingChange?.(true);
    try {
      if (isOAuth) {
        const result = await persistOAuth(data);
        createNotification({
          text: `Variable "${result.key}" ${isUpdate ? "updated" : "created"}`,
          type: "success"
        });
      } else if (variable) {
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
      onClose();
    } catch (error) {
      if (!isOAuth) flagServerKeyError(error);
    } finally {
      onPendingChange?.(false);
    }
  };

  let submitLabel = `Add ${isPersonal ? "Personal" : "Global"} Variable`;
  if (isUpdate) submitLabel = "Save";
  else if (fixedType === AgentVaultVariableType.OAuth) submitLabel = CREATE_OAUTH_VARIABLE_TITLE;
  // A variable an OAuth sign-in already created has nothing left to add unless it was changed since.
  const isDone = isCreatedHere && !isDirty && isConnected;

  // One main action, worded for what the variable needs next. Without a sign-in here (an app hosts the callback, or
  // the caller can't edit), the form only saves.
  let signInLabel: string | null = null;
  if (isOAuth && canStartSignIn) {
    if (!isConnected) signInLabel = hasConnection ? "Reauthorize" : "Authorize";
    else if (!isDirty) signInLabel = "Reauthorize";
    else if (isSignInEdit) signInLabel = "Save and Reauthorize";
  }

  const headerProps = { variable, scope };

  return (
    <FormProvider {...formMethods}>
      {showHeader && (
        <SheetHeader>
          <SheetTitle>{variableFormTitle({ ...headerProps, type: fixedType })}</SheetTitle>
          <SheetDescription>{variableFormDescription({ ...headerProps, type })}</SheetDescription>
        </SheetHeader>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {canChooseType && !isCreatedHere && (
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Field>
                  <FieldLabel id={typeLabelId}>Type</FieldLabel>
                  <FieldContent>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        clearErrors();
                      }}
                      disabled={isSigningIn}
                    >
                      <SelectTrigger aria-labelledby={typeLabelId} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.values(AgentVaultVariableType).map((value) => (
                          <SelectItem key={value} value={value}>
                            {TYPE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
              )}
            />
          )}
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
                    placeholder={isOAuth ? "GOOGLE_DRIVE" : "GITHUB_TOKEN"}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>
                    {isRenaming && usedByCount > 0 && (
                      <>
                        {usedByCount === 1
                          ? "The service that uses it keeps working"
                          : `The ${usedByCount} services that use it keep working`}{" "}
                        under the new key.
                      </>
                    )}
                    {!(isRenaming && usedByCount > 0) &&
                      (isOAuth ? (
                        "Services choose it by this key as their OAuth credential."
                      ) : (
                        <>
                          {isPersonal ? "Your personal values use" : "Services use"} it as{" "}
                          <code className="font-mono">{toVariableReference(key || "KEY")}</code>.
                        </>
                      ))}
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          {!isOAuth && (
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
          )}
          {isOAuth && (
            <OAuthVariableFields
              variable={saved}
              getValidValues={getValidValues}
              persist={persistOAuth}
              projectId={projectId}
              onSignInChange={changeSigningIn}
              onAuthorized={markSavedConnected}
              registerAuthorize={registerAuthorize}
              onCanAuthorizeChange={setCanStartSignIn}
              initialSignInStart={signInStart}
            />
          )}
          {isSignOutOnSave && saved && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
              <span>
                Saving signs {saved.key} out.
                {usedByCount === 1 &&
                  " The service that uses it stops working until it is signed in again."}
                {usedByCount > 1 &&
                  ` The ${usedByCount} services that use it stop working until it is signed in again.`}
              </span>
            </p>
          )}
        </div>

        <SheetFooter className="items-center justify-between border-t">
          <span className="text-xs text-muted">
            {isSigningIn && "Finish or cancel signing in first."}
            {!isSigningIn &&
              isSecretUnsent &&
              !signInLabel &&
              "Authorize to save the client secret."}
          </span>
          <div className="flex items-center gap-2">
            {isDone ? (
              <Button
                type="button"
                variant="av"
                onClick={onClose}
                isDisabled={isSigningIn || isSecretUnsent}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  isDisabled={isSigningIn || isSubmitting}
                >
                  {isCreatedHere || (signInLabel && !isDirty) ? "Close" : "Cancel"}
                </Button>
                {signInLabel ? (
                  <Button
                    type="button"
                    variant="av"
                    isDisabled={isSigningIn || isSubmitting}
                    onClick={() => authorizeRef.current?.()}
                  >
                    {signInLabel}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="av"
                    isPending={isSubmitting}
                    isDisabled={(isUpdate && !isDirty) || isSigningIn || isSecretUnsent}
                  >
                    {submitLabel}
                  </Button>
                )}
              </>
            )}
          </div>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};

type SheetProps = Omit<TVariableFormProps, "onClose" | "onPendingChange" | "onDirtyChange"> & {
  onOpenChange: (isOpen: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export const VariableFormSheet = ({
  isOpen,
  onOpenChange,
  onCloseAutoFocus,
  ...formProps
}: SheetProps) => {
  const [isPending, setIsPending] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const close = () => onOpenChange(false);
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (open) onOpenChange(true);
        else requestDiscard();
      }}
    >
      <SheetContent
        size="form"
        isPending={isPending}
        // The form focuses the value itself when the key arrives filled in.
        onOpenAutoFocus={(event) => {
          if (formProps.initialKey) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          setIsPending(false);
          setIsDirty(false);
          onCloseAutoFocus?.(event);
        }}
      >
        <VariableForm
          showHeader
          isOpen={isOpen}
          onClose={close}
          onCancel={requestDiscard}
          onPendingChange={setIsPending}
          onDirtyChange={setIsDirty}
          {...formProps}
        />
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="Your changes will be lost."
        />
      </SheetContent>
    </Sheet>
  );
};
