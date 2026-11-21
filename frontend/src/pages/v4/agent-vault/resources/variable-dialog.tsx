import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import axios from "axios";

import { AGENT_VAULT_NO_CONTROL_CHARS_RE } from "@app/helpers/agentVaultControlChars";
import {
  VARIABLE_KEY_MAX_LENGTH,
  VARIABLE_KEY_MESSAGE,
  VARIABLE_KEY_RE,
  VARIABLE_VALUE_MAX_LENGTH
} from "@app/helpers/agentVaultVariables";
import { AgentVaultVariableScope } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";
import { ApiErrorTypes, type TApiErrors } from "@app/hooks/api/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const keyError = (key: string, taken: boolean, isPersonal: boolean) => {
  if (!key) return "Required";
  if (key.length > VARIABLE_KEY_MAX_LENGTH)
    return `A key can be at most ${VARIABLE_KEY_MAX_LENGTH} characters.`;
  if (!VARIABLE_KEY_RE.test(key)) return VARIABLE_KEY_MESSAGE;
  if (taken)
    return isPersonal
      ? `You already have a variable named '${key}'.`
      : `A variable named '${key}' already exists.`;
  return undefined;
};

const valueError = (value: string, required: boolean) => {
  if (!value) return required ? "Required" : undefined;
  if (value.length > VARIABLE_VALUE_MAX_LENGTH)
    return `A value can be at most ${VARIABLE_VALUE_MAX_LENGTH} characters.`;
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(value))
    return "A value can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";
  if (!value.trim()) return "A value can't be only spaces.";
  return undefined;
};

export const VariableDialog = ({
  projectId,
  scope,
  variable,
  initialKey = "",
  onCreated,
  onOpenChange
}: {
  projectId: string;
  scope: AgentVaultVariableScope;
  variable?: TAgentVaultVariable;
  initialKey?: string;
  onCreated?: (variable: TAgentVaultVariable) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const create = resources.useCreateVariable(projectId);
  const update = resources.useUpdateVariable(projectId);
  const isPersonal = scope === AgentVaultVariableScope.Personal;
  const [key, setKey] = useState(variable?.key ?? initialKey);
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<{ key?: string; value?: string }>({});
  const [pending, setPending] = useState(false);
  const [debouncedKey] = useDebounce(key, 300);
  const lookupKey =
    debouncedKey === key && VARIABLE_KEY_RE.test(key) && key !== variable?.key ? key : null;
  const { existing } = resources.useVariableKeyStatus(projectId, lookupKey ? [lookupKey] : [], {
    isCached: false,
    scope
  });
  const isTaken = Boolean(lookupKey && existing.has(lookupKey));
  const usedByCount = variable?.usedByServices.length ?? 0;
  const isRenaming = Boolean(variable) && Boolean(key) && key !== variable?.key;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: key !== (variable?.key ?? initialKey) || Boolean(value),
    onDiscard: () => onOpenChange(false)
  });

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>
              {variable
                ? `Edit ${variable.key}`
                : `Add ${isPersonal ? "personal" : "global"} variable`}
            </DialogTitle>
          </DialogHeader>
          <form
            id="agent-vault-variable"
            autoComplete="off"
            onSubmit={async (event) => {
              event.preventDefault();
              const next = {
                key: keyError(key, isTaken, isPersonal),
                value: valueError(value, !variable)
              };
              setErrors(next);
              if (next.key || next.value) return;
              setPending(true);
              try {
                if (variable) {
                  await update.mutateAsync({
                    variableId: variable.id,
                    key: key === variable.key ? undefined : key,
                    value: value.length > 0 ? value : undefined
                  });
                  saved(`Variable ${key} updated`);
                } else {
                  const created = await create.mutateAsync({ scope, key, value });
                  onCreated?.(created);
                  saved(`Variable ${key} created`);
                }
                onOpenChange(false);
              } catch (error) {
                const response = axios.isAxiosError(error)
                  ? (error.response?.data as TApiErrors | undefined)
                  : undefined;
                if (
                  response?.error === ApiErrorTypes.BadRequestError &&
                  (response.details as { field?: string } | undefined)?.field === "key"
                )
                  setErrors({ key: response.message });
                failed(`Failed to ${variable ? "update" : "create"} variable`, error);
              } finally {
                setPending(false);
              }
            }}
          >
            <Stack gap={16}>
              <Field
                label="Key"
                description={
                  isRenaming && usedByCount > 0
                    ? `${usedByCount === 1 ? "The service" : `The ${usedByCount} services`} using it switch to the new key.`
                    : "Upper case letters, numbers and underscores. Reference it as {{KEY}}."
                }
                error={errors.key ?? (isTaken ? keyError(key, true, isPersonal) : undefined)}
              >
                <Input
                  mono
                  value={key}
                  maxLength={VARIABLE_KEY_MAX_LENGTH}
                  placeholder="GITHUB_TOKEN"
                  invalid={Boolean(errors.key) || isTaken}
                  onChange={(event) => {
                    setKey(event.target.value.toUpperCase());
                    setErrors((current) => ({ ...current, key: undefined }));
                  }}
                />
              </Field>
              <Field
                label="Value"
                description={variable ? "Leave blank to keep the current value." : undefined}
                error={errors.value}
              >
                <SecretInput
                  aria-label="Value"
                  value={value}
                  invalid={Boolean(errors.value)}
                  onChange={(next) => {
                    setValue(next);
                    setErrors((current) => ({ ...current, value: undefined }));
                  }}
                />
              </Field>
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={requestDiscard}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="agent-vault-variable" loading={pending}>
              {variable ? "Save" : "Add variable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};
