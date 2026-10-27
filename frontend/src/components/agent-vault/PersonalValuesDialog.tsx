import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, ControllerRenderProps, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  FieldLabel
} from "@app/components/v3";
import { findTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";
import {
  findVariableReferences,
  MAX_PERSONAL_VARIABLES,
  variableReferenceError
} from "@app/helpers/agentVaultVariables";
import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField,
  AgentVaultVariableScope,
  TAgentVaultMemberProvidedField,
  useDeleteAgentVaultPersonalValues,
  useGetAgentVaultAccessBundle,
  useListAgentVaultVariables,
  useSetAgentVaultPersonalValues
} from "@app/hooks/api/agentVault";
import { TAgentVaultService, TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

import { SecretInput } from "./service-sheet/CredentialFields";
import { TServiceForm } from "./service-sheet/serviceSchema";
import {
  NO_MISSING_KEYS,
  NO_STORED_KEYS,
  ServiceVariablesContext
} from "./service-sheet/ServiceVariablesContext";
import { VariableKeyChips } from "./service-sheet/VariableChips";
import { VariableFormDialog } from "./VariableFormDialog";

// Mirrors AGENT_VAULT_NO_CONTROL_CHARS_RE on the backend.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

const CONTROL_CHARS_MESSAGE =
  "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";

// The fields reuse the service sheet's secret input, which names them as the sheet does: a token or a basic
// password is `secret`.
type TFormField = "secret" | "username";

const FORM_FIELD_OF: Record<TAgentVaultMemberProvidedField, TFormField> = {
  [AgentVaultVariableReferenceField.CredentialValue]: "secret",
  [AgentVaultVariableReferenceField.CredentialUsername]: "username"
};

// credential-value is a bearer token or a basic password.
const fieldLabel = (
  credentialType: AgentVaultCredentialType,
  field: TAgentVaultMemberProvidedField
) => {
  if (field === AgentVaultVariableReferenceField.CredentialUsername) return "Username";
  return credentialType === AgentVaultCredentialType.Basic ? "Password" : "Token";
};

// The API's limits: a username like the admin's, a token or password like theirs.
const MAX_USERNAME_LENGTH = 256;
const MAX_LENGTH = 8192;

type TFormData = { secret: string; username: string };

// A field with a saved value may be left blank, which keeps that value.
const buildSchema = (
  fields: TAgentVaultMemberProvidedField[],
  savedFields: ReadonlySet<TAgentVaultMemberProvidedField>,
  variableKeys?: string[]
) => {
  const keys = variableKeys ? new Set(variableKeys) : undefined;
  return z.object({ secret: z.string(), username: z.string() }).superRefine((data, ctx) => {
    fields.forEach((field) => {
      const formField = FORM_FIELD_OF[field];
      const value =
        field === AgentVaultVariableReferenceField.CredentialUsername
          ? data[formField].trim()
          : data[formField];
      const at = (message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [formField], message });
      const maxLength =
        field === AgentVaultVariableReferenceField.CredentialUsername
          ? MAX_USERNAME_LENGTH
          : MAX_LENGTH;

      if (!value) {
        if (!savedFields.has(field)) at("Required");
      } else if (value.length > maxLength) {
        at(`This can be at most ${maxLength} characters.`);
      } else if (!NO_CONTROL_CHARS_RE.test(value)) at(CONTROL_CHARS_MESSAGE);
      else {
        // Only once the list has loaded: until then no key can be called missing.
        const missingKeys = keys
          ? new Set(findVariableReferences(value).filter((ref) => !keys.has(ref)))
          : undefined;
        const referenceError = variableReferenceError(value, missingKeys, { isPersonal: true });
        if (referenceError) at(referenceError);
      }
    });
  });
};

export type TPersonalValuesTarget = { service: TAgentVaultService; accessBundleName: string };

type Props = {
  target: TPersonalValuesTarget | null;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * Sets the caller's own values for a service that leaves some of its fields to each member. Values never come back,
 * so ones already set are replaced in full by typing them again.
 */
export const PersonalValuesDialog = ({ target, onOpenChange }: Props) => {
  const isOpen = Boolean(target);
  // Read from the bundle query rather than the copy the dialog opened with, so a refetch after an admin changes the
  // service (a save answered 409) shows the service as it is now.
  const { data: liveBundle } = useGetAgentVaultAccessBundle(
    isOpen ? (target?.service.accessBundleId ?? "") : ""
  );
  const service =
    liveBundle?.services.find((candidate) => candidate.id === target?.service.id) ??
    target?.service;
  const personalValues = service?.personalValues;
  const setValues = useSetAgentVaultPersonalValues();
  const deleteValues = useDeleteAgentVaultPersonalValues();
  // A member keeps at most MAX_PERSONAL_VARIABLES, so one page holds every one of them.
  const { data: variablePage } = useListAgentVaultVariables(
    { scope: AgentVaultVariableScope.Personal, limit: MAX_PERSONAL_VARIABLES },
    { enabled: isOpen }
  );
  const variables = variablePage?.variables;
  const variableKeys = useMemo(() => variables?.map((variable) => variable.key), [variables]);

  const fields = useMemo(
    () =>
      // The username comes first, the way a basic credential reads.
      (personalValues?.fields ?? [])
        .map(({ field }) => field)
        .sort(
          (a, b) =>
            Number(b === AgentVaultVariableReferenceField.CredentialUsername) -
            Number(a === AgentVaultVariableReferenceField.CredentialUsername)
        ),
    [personalValues]
  );
  const savedFields = useMemo(
    () =>
      new Set(
        (personalValues?.fields ?? []).filter((entry) => entry.isSet).map((entry) => entry.field)
      ),
    [personalValues]
  );
  const schema = useMemo(
    () => buildSchema(fields, savedFields, variableKeys),
    [fields, savedFields, variableKeys]
  );

  const formMethods = useForm<TFormData>({
    defaultValues: { secret: "", username: "" },
    resolver: zodResolver(schema)
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = formMethods;

  // A new type gives the same fields a different meaning (a password becomes a token), so what was typed goes.
  useEffect(() => {
    if (isOpen) reset({ secret: "", username: "" });
  }, [isOpen, service?.id, service?.credential.type, reset]);

  // One dialog for every field, settled once it has closed, as in the service sheet.
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [newVariableKey, setNewVariableKey] = useState<string | null>(null);
  const newVariableRequest = useRef<{
    resolve: (variable: TAgentVaultVariable | null) => void;
    created: TAgentVaultVariable | null;
  } | null>(null);
  const requestVariable = useCallback(
    (key: string) =>
      new Promise<TAgentVaultVariable | null>((resolve) => {
        newVariableRequest.current?.resolve(null);
        newVariableRequest.current = { resolve, created: null };
        setNewVariableKey(key);
      }),
    []
  );
  const formValues = formMethods.watch();
  const referencedKeys = fields.flatMap((field) =>
    findVariableReferences(formValues[FORM_FIELD_OF[field]] ?? "")
  );
  const missingKeys = useMemo(() => {
    if (!variableKeys) return NO_MISSING_KEYS;
    const known = new Set(variableKeys);
    return new Set(referencedKeys.filter((key) => !known.has(key)));
    // Keyed on the joined list, which is new on every render as an array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableKeys, referencedKeys.join(",")]);
  const ownVariables = useMemo(
    () => ({
      missingKeys,
      storedKeys: NO_STORED_KEYS,
      requestVariable,
      localVariables: variables,
      isLocal: true
    }),
    [missingKeys, variables, requestVariable]
  );

  const template = service ? findTemplateForHostPattern(service.hostPattern) : undefined;
  const providerName = template?.name ?? service?.name;

  const storedKeysOf = (field: TAgentVaultMemberProvidedField) =>
    (personalValues?.fields.find((entry) => entry.field === field)?.variableReferences ?? []).map(
      (reference) => reference.key
    );
  const lastSetAt = personalValues?.fields.reduce<string | null>(
    (latest, { updatedAt }) => (updatedAt && (!latest || updatedAt > latest) ? updatedAt : latest),
    null
  );

  const onSubmit = async (data: TFormData) => {
    if (!service) return;
    try {
      await setValues.mutateAsync({
        accessBundleId: service.accessBundleId,
        serviceId: service.id,
        credentialType: service.credential.type,
        // A blank field keeps its saved value, so only the ones typed are sent.
        values: fields
          .map((field) => ({
            field,
            value:
              field === AgentVaultVariableReferenceField.CredentialUsername
                ? data.username.trim()
                : data[FORM_FIELD_OF[field]]
          }))
          .filter(({ value }) => value.length > 0)
      });
      createNotification({ text: `Personal values saved for ${service.name}`, type: "success" });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const handleRemove = async () => {
    if (!service) return;
    try {
      await deleteValues.mutateAsync({
        accessBundleId: service.accessBundleId,
        serviceId: service.id
      });
      createNotification({
        text: `Personal values removed for ${service.name}`,
        type: "success"
      });
      setIsRemoveOpen(false);
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>
            {personalValues?.isConfigured ? "Update" : "Set Up"} Personal Values for {service?.name}
          </DialogTitle>
          <DialogDescription>
            {personalValues?.isConfigured && lastSetAt
              ? `You set these up on ${format(new Date(lastSetAt), "MMM d, yyyy")}. Sessions you start with ${target?.accessBundleName} use them. A field you leave blank keeps its saved value.`
              : `Sessions you start with ${target?.accessBundleName} use your personal ${providerName} values. Only you can read them.`}
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...formMethods}>
          <ServiceVariablesContext.Provider value={ownVariables}>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {fields.map((field) => {
                const label = fieldLabel(
                  service?.credential.type ?? AgentVaultCredentialType.Bearer,
                  field
                );
                const storedKeys = storedKeysOf(field);
                return (
                  <Controller
                    key={field}
                    control={control}
                    name={FORM_FIELD_OF[field]}
                    render={({ field: formField, fieldState }) => (
                      <Field>
                        <FieldLabel>
                          {providerName} {label.toLowerCase()}
                        </FieldLabel>
                        <FieldContent>
                          <SecretInput
                            // The input is the service sheet's, typed against its form. This form names the
                            // same two fields, so only the type differs.
                            field={
                              formField as unknown as ControllerRenderProps<
                                TServiceForm,
                                TFormField
                              >
                            }
                            label={label}
                            placeholder={
                              savedFields.has(field)
                                ? "Leave blank to keep your saved value"
                                : "Enter a value or choose a variable"
                            }
                            isError={Boolean(fieldState.error)}
                            isUntouched={false}
                            hasStoredSecret={false}
                            canBeCleared={false}
                            canInsertVariable
                          />
                          {savedFields.has(field) && storedKeys.length > 0 && (
                            <FieldDescription className="flex flex-wrap items-center gap-1">
                              Your current {label.toLowerCase()} uses
                              <VariableKeyChips keys={storedKeys} />
                            </FieldDescription>
                          )}
                          <FieldError>{fieldState.error?.message}</FieldError>
                        </FieldContent>
                      </Field>
                    )}
                  />
                );
              })}

              <DialogFooter className="sm:justify-between">
                {savedFields.size > 0 ? (
                  <Button type="button" variant="danger" onClick={() => setIsRemoveOpen(true)}>
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    isDisabled={isSubmitting}
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="av"
                    isPending={isSubmitting}
                    // Every field is saved and none was typed, so there is nothing to send.
                    isDisabled={fields.every(
                      (field) =>
                        savedFields.has(field) && !(formValues[FORM_FIELD_OF[field]] ?? "").trim()
                    )}
                  >
                    Save
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </ServiceVariablesContext.Provider>
        </FormProvider>

        <AlertDialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove your personal {service?.name} values?</AlertDialogTitle>
              <AlertDialogDescription>
                Until you set them up again, your sessions can&apos;t reach {service?.name}. Your
                variables are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
              {/* A plain button rather than AlertDialogAction, which closes on click and would drop the
                  pending state before the request settles. */}
              <Button
                variant="danger"
                size="sm"
                isPending={deleteValues.isPending}
                onClick={handleRemove}
              >
                Remove Personal Values
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <VariableFormDialog
          scope={AgentVaultVariableScope.Personal}
          isOpen={newVariableKey !== null}
          onOpenChange={(open) => {
            if (!open) setNewVariableKey(null);
          }}
          initialKey={newVariableKey ?? undefined}
          onCreated={(variable) => {
            if (newVariableRequest.current) newVariableRequest.current.created = variable;
          }}
          onCloseAutoFocus={(event) => {
            const request = newVariableRequest.current;
            if (!request) return;
            event.preventDefault();
            newVariableRequest.current = null;
            request.resolve(request.created);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
