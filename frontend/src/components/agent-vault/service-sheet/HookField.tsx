import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { WebhookIcon } from "lucide-react";

import { AgentVaultHooksUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import {
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { useDebounce } from "@app/hooks";
import { AgentVaultServiceType, useListAgentVaultHooks } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { HookNarrowingFields } from "../hooks/HookNarrowingFields";
import { useHookCreation } from "../hooks/useHookCreation";
import { serviceHookDraftOf, TServiceForm } from "./serviceSchema";

const HOOK_PICKER_LIMIT = 100;

// The saved hook may be missing from the picker's current results, so it is shown from its ID and name alone.
const selectedHookOption = (id: string, name: string): TAgentVaultHook => ({
  id,
  projectId: "",
  name,
  description: null,
  url: "",
  usedBy: [],
  createdAt: "",
  updatedAt: ""
});

export const HookField = () => {
  const { projectId } = useProject();
  const { subscription } = useSubscription();
  const { control, setValue, clearErrors } = useFormContext<TServiceForm>();
  const [serviceType, hookId, hookName] = useWatch({
    control,
    name: ["serviceType", "hook.hookId", "hook.hookName"]
  });
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data: hookPage, isFetching } = useListAgentVaultHooks(projectId, {
    search: debouncedSearch.trim() || undefined,
    limit: HOOK_PICKER_LIMIT
  });

  const pickHook = (hook: Pick<TAgentVaultHook, "id" | "name">) => {
    setValue("hook.hookId", hook.id, { shouldDirty: true });
    setValue("hook.hookName", hook.name, { shouldDirty: true });
  };

  const removeHook = () => {
    setValue("hook", serviceHookDraftOf(null), { shouldDirty: true });
    clearErrors("hook");
  };

  const { creation, upgradeGate: creationUpgradeGate } = useHookCreation(pickHook);

  // Off-plan, a service's hook can't be set or changed, though the one it has keeps working and can be removed.
  const isOnPlan = Boolean(subscription.agentVaultHooks);

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="agent-vault-service-hook">
          Hook <span className="text-muted">(optional)</span>
        </FieldLabel>
        <FieldContent>
          <Combobox<TAgentVaultHook>
            id="agent-vault-service-hook"
            options={hookPage?.hooks ?? []}
            value={hookId ? selectedHookOption(hookId, hookName) : null}
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
            renderValue={(hook) => (
              <span className="flex min-w-0 items-center gap-2">
                <WebhookIcon className="size-4 shrink-0 text-muted" />
                <span className="truncate">{hook.name}</span>
              </span>
            )}
            placeholder="No hook"
            searchAriaLabel="Search hooks"
            emptyMessage={search ? "No hooks match your search" : "No hooks yet"}
            modal
            isDisabled={!isOnPlan && !hookId}
            isOptionDisabled={() => !isOnPlan}
            creation={isOnPlan ? creation : undefined}
            onValueChange={pickHook}
            onClear={removeHook}
          />
          <FieldDescription>
            {isOnPlan ? (
              `Every session that uses this service ${
                serviceType === AgentVaultServiceType.Http ||
                serviceType === AgentVaultServiceType.Mcp
                  ? "sends matching requests to the hook"
                  : "asks the hook before each connection"
              }.`
            ) : (
              <>
                Hooks aren&apos;t included in your plan, so this service&apos;s hook can&apos;t be
                set or changed. You can still remove it. A hook it already has keeps working.{" "}
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

      {hookId && <HookNarrowingFields serviceType={serviceType} isDisabled={!isOnPlan} />}

      {upgradeGate}
      {creationUpgradeGate}
    </div>
  );
};
