import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { format } from "date-fns";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/helpers/agentVaultControlChars";
import { findTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";
import {
  findVariableReferences,
  MAX_PERSONAL_VARIABLES,
  variableReferenceError
} from "@app/helpers/agentVaultVariables";
import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField,
  AgentVaultVariableScope
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultMemberProvidedField,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const MAX_USERNAME_LENGTH = 256;
const MAX_LENGTH = 8192;

const fieldLabel = (
  credentialType: AgentVaultCredentialType,
  field: TAgentVaultMemberProvidedField
) => {
  if (field === AgentVaultVariableReferenceField.CredentialUsername) return "Username";
  return credentialType === AgentVaultCredentialType.Basic ? "Password" : "Token";
};

const PersonalValuesForm = ({
  projectId,
  service,
  onOpenChange
}: {
  projectId: string;
  service: TAgentVaultService;
  onOpenChange: (open: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const setValues = resources.useSetPersonalValues(projectId);
  const deleteValues = resources.useDeletePersonalValues(projectId);
  const { data: variablePage } = resources.useVariables(projectId, {
    scope: AgentVaultVariableScope.Personal,
    limit: MAX_PERSONAL_VARIABLES
  });
  const variableKeys = useMemo(
    () =>
      variablePage ? new Set(variablePage.variables.map((variable) => variable.key)) : undefined,
    [variablePage]
  );
  const { personalValues } = service;
  const fields = (personalValues?.fields ?? [])
    .map(({ field }) => field)
    .sort(
      (a, b) =>
        Number(b === AgentVaultVariableReferenceField.CredentialUsername) -
        Number(a === AgentVaultVariableReferenceField.CredentialUsername)
    );
  const savedFields = new Set(
    (personalValues?.fields ?? []).filter((entry) => entry.isSet).map((entry) => entry.field)
  );
  const [values, setFormValues] = useState<Partial<Record<TAgentVaultMemberProvidedField, string>>>(
    {}
  );
  const [errors, setErrors] = useState<Partial<Record<TAgentVaultMemberProvidedField, string>>>({});
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);

  const hostPattern = hostPatternOf(service);
  const providerName =
    (hostPattern ? findTemplateForHostPattern(hostPattern)?.name : undefined) ?? service.name;
  const isOAuth = service.credential.type === AgentVaultCredentialType.OAuth;
  const lastSetAt = personalValues?.fields.reduce<string | null>(
    (latest, { updatedAt }) => (updatedAt && (!latest || updatedAt > latest) ? updatedAt : latest),
    null
  );
  const valueOf = (field: TAgentVaultMemberProvidedField) => {
    const value = values[field] ?? "";
    return field === AgentVaultVariableReferenceField.CredentialUsername ? value.trim() : value;
  };

  const errorOf = (field: TAgentVaultMemberProvidedField) => {
    const value = valueOf(field);
    const maxLength =
      field === AgentVaultVariableReferenceField.CredentialUsername
        ? MAX_USERNAME_LENGTH
        : MAX_LENGTH;
    if (!value) return savedFields.has(field) ? undefined : "Required";
    if (value.length > maxLength) return `This can be at most ${maxLength} characters.`;
    if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(value)) return AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE;
    const missing = variableKeys
      ? new Set(findVariableReferences(value).filter((key) => !variableKeys.has(key)))
      : undefined;
    return variableReferenceError(value, missing, { isPersonal: true }) ?? undefined;
  };

  let description = `Your sessions use your personal ${providerName} values in every access bundle with this service. Only you can read them.`;
  if (personalValues?.isConfigured && lastSetAt)
    description = `You set these up on ${format(new Date(lastSetAt), "MMM d, yyyy")}. A field you leave blank keeps its saved value.`;

  const hasSavedValues = savedFields.size > 0;
  const nothingTyped = fields.every((field) => savedFields.has(field) && !valueOf(field));

  return (
    <>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>
            {`${personalValues?.isConfigured ? "Update" : "Set up"} personal values for ${service.name}`}
          </DialogTitle>
          <DialogDescription>
            {isOAuth
              ? "This service signs each member in with their own account. Connecting an account isn't available in v4 yet."
              : description}
          </DialogDescription>
        </DialogHeader>
        {!isOAuth && (
          <form
            id="agent-vault-personal-values"
            autoComplete="off"
            onSubmit={async (event) => {
              event.preventDefault();
              const next = Object.fromEntries(fields.map((field) => [field, errorOf(field)]));
              setErrors(next);
              if (Object.values(next).some(Boolean)) return;
              setPending(true);
              try {
                await setValues.mutateAsync({
                  serviceId: service.id,
                  credentialType: service.credential.type,
                  values: fields
                    .map((field) => ({ field, value: valueOf(field) }))
                    .filter(({ value }) => value.length > 0)
                });
                saved(`Personal values saved for ${service.name}`);
                onOpenChange(false);
              } catch (error) {
                failed("Failed to save personal values", error);
              } finally {
                setPending(false);
              }
            }}
          >
            <Stack gap={16}>
              {fields.map((field) => {
                const label = fieldLabel(service.credential.type, field);
                return (
                  <Field
                    key={field}
                    label={`${providerName} ${label.toLowerCase()}`}
                    error={errors[field]}
                  >
                    <SecretInput
                      aria-label={label}
                      placeholder={
                        savedFields.has(field)
                          ? "Leave blank to keep your saved value"
                          : "Enter a value or a {{variable}}"
                      }
                      value={values[field] ?? ""}
                      invalid={Boolean(errors[field])}
                      onChange={(value) => setFormValues((prev) => ({ ...prev, [field]: value }))}
                    />
                  </Field>
                );
              })}
            </Stack>
          </form>
        )}
        <DialogFooter>
          <Inline gap={8} justify="between" style={{ width: "100%" }}>
            {hasSavedValues ? (
              <Button variant="destructive" disabled={pending} onClick={() => setRemoving(true)}>
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Inline gap={8}>
              <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
                {isOAuth ? "Close" : "Cancel"}
              </Button>
              {!isOAuth && (
                <Button
                  variant="primary"
                  type="submit"
                  form="agent-vault-personal-values"
                  loading={pending}
                  disabled={nothingTyped}
                >
                  Save
                </Button>
              )}
            </Inline>
          </Inline>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove your personal values for ${service.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Your sessions can&apos;t reach this service until you set them up again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteValues.mutateAsync({ serviceId: service.id });
                  saved(`Personal values removed for ${service.name}`);
                  onOpenChange(false);
                } catch (error) {
                  failed("Failed to remove personal values", error);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const PersonalValuesDialog = ({
  projectId,
  service,
  onOpenChange
}: {
  projectId: string;
  service?: TAgentVaultService;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={Boolean(service)} onOpenChange={onOpenChange}>
    {service && (
      <PersonalValuesForm
        key={`${service.id}:${service.credential.type}`}
        projectId={projectId}
        service={service}
        onOpenChange={onOpenChange}
      />
    )}
  </Dialog>
);
