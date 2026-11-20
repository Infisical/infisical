import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { TrashIcon, WebhookIcon } from "lucide-react";

import { AgentVaultHooksUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import {
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  IconButton
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useListAgentVaultHooks } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { HookNarrowingFields } from "../hooks/HookNarrowingFields";
import { blankHookNarrowing, hookNarrowingDraftOf } from "../hooks/hookSchema";
import { useHookCreation } from "../hooks/useHookCreation";
import { TServiceForm } from "./serviceSchema";

const HOOK_PICKER_LIMIT = 100;

// A selected hook may be missing from the picker's current results, so it is shown from its ID and name alone.
const selectedHookOption = (id: string, name: string): TAgentVaultHook => ({
  id,
  name,
  description: null,
  url: "",
  rules: [],
  appliesToAllServices: false,
  createdAt: "",
  updatedAt: ""
});

type Props = {
  canEdit: boolean;
  /** The service's name as saved, so a hook created here that already names it starts from that rule. */
  savedServiceName?: string;
  /** Called for a hook created here that already holds this service, which saving must not add again. */
  onCreatedWithService: (hook: TAgentVaultHook) => void;
};

export const HookLinksFields = ({ canEdit, savedServiceName, onCreatedWithService }: Props) => {
  const { projectId } = useProject();
  const { subscription } = useSubscription();
  const { control } = useFormContext<TServiceForm>();
  const serviceType = useWatch({ control, name: "serviceType" });
  const hooks = useFieldArray({ control, name: "hooks", keyName: "fieldId" });
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data: hookPage, isFetching } = useListAgentVaultHooks(projectId, {
    search: debouncedSearch.trim() || undefined,
    limit: HOOK_PICKER_LIMIT
  });

  const addHook = (
    hook: Pick<TAgentVaultHook, "id" | "name">,
    rule?: TAgentVaultHook["rules"][number]
  ) =>
    hooks.append({
      hookId: hook.id,
      hookName: hook.name,
      ...(rule ? hookNarrowingDraftOf(rule) : blankHookNarrowing())
    });

  const { creation, upgradeGate: creationUpgradeGate } = useHookCreation((hook) => {
    const rule = savedServiceName
      ? hook.rules.find((candidate) => candidate.service === savedServiceName)
      : undefined;
    if (rule) onCreatedWithService(hook);
    addHook(hook, rule);
  });

  // Off-plan, a service can't be added to a hook or changed in one, though its hooks keep working.
  const isOnPlan = Boolean(subscription.agentVaultHooks);
  const isEditable = canEdit && isOnPlan;
  const selected = hooks.fields.map((hook) => selectedHookOption(hook.hookId, hook.hookName));

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="agent-vault-service-hooks">Hooks</FieldLabel>
        <FieldContent>
          <Combobox<TAgentVaultHook>
            id="agent-vault-service-hooks"
            multiple
            options={hookPage?.hooks ?? []}
            value={selected}
            shouldFilter={false}
            isLoading={isFetching}
            includeMissingSelectedOptions
            onInputValueChange={setSearch}
            getOptionValue={(hook) => hook.id}
            getOptionLabel={(hook) => hook.name}
            renderOption={(hook) => (
              <span className="flex min-w-0 items-center gap-2">
                <WebhookIcon className="size-4 shrink-0 text-muted" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{hook.name}</span>
                  {hook.url && <span className="truncate text-xs text-muted">{hook.url}</span>}
                </span>
              </span>
            )}
            placeholder={isEditable ? "Pick hooks" : "No hooks"}
            searchAriaLabel="Search hooks"
            emptyMessage={search ? "No hooks match your search" : "No hooks yet"}
            modal
            isDisabled={!isEditable}
            creation={creation}
            onValueChange={(options) => {
              const ids = new Set(options.map((option) => option.id));
              const removed = hooks.fields
                .map((hook, index) => (ids.has(hook.hookId) ? -1 : index))
                .filter((index) => index !== -1);
              if (removed.length) hooks.remove(removed);
              const kept = new Set(hooks.fields.map((hook) => hook.hookId));
              options.filter((option) => !kept.has(option.id)).forEach((option) => addHook(option));
            }}
          />
          <FieldDescription>
            {isOnPlan || !canEdit ? (
              "Each hook checks this service only in sessions started with that hook."
            ) : (
              <>
                Hooks aren&apos;t included in your plan, so this service can&apos;t be added to one
                or changed in one. Its hooks keep working.{" "}
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() =>
                    openUpgradeGate({
                      intent: AgentVaultHooksUpgradeIntent,
                      paywallKey: "agent-vault.hooks"
                    })
                  }
                >
                  Upgrade
                </Button>
              </>
            )}
          </FieldDescription>
        </FieldContent>
      </Field>

      {hooks.fields.map((hook, index) => (
        <div key={hook.fieldId} className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <WebhookIcon className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{hook.hookName}</span>
            {isEditable && (
              <IconButton
                variant="ghost"
                size="xs"
                aria-label={`Remove from ${hook.hookName}`}
                onClick={() => hooks.remove(index)}
              >
                <TrashIcon />
              </IconButton>
            )}
          </div>
          <HookNarrowingFields
            prefix={`hooks.${index}`}
            serviceType={serviceType}
            isDisabled={!isEditable}
          />
        </div>
      ))}

      {upgradeGate}
      {creationUpgradeGate}
    </div>
  );
};
