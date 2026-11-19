import { useState } from "react";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Link } from "@infisical/cipher/ui/link";

import {
  OAUTH_STATUS_LABELS,
  storedOAuthVariableKey
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { keepInClassic } from "@app/helpers/v4Bridge";
import {
  AgentVaultOauthStatus,
  AgentVaultVariableScope,
  AgentVaultVariableType
} from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useOrgId, useProjectPermission } from "../../access/permissions";
import { useV4Adapter } from "../../data/adapters";
import type { TServiceFormApi } from "./service-form";

// v4 can't sign an OAuth variable in yet. The tab opens with an opener so it inherits the session's classic paths,
// and the half-filled service sheet stays open here.
const ClassicVariablesLink = ({ projectId }: { projectId: string }) => {
  const href = `/organizations/${useOrgId()}/projects/agent-vault/${projectId}/variables`;
  return (
    <Link
      href={href}
      data-open-classic
      onClick={(event) => {
        keepInClassic(href);
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        window.open(href, "_blank");
      }}
    >
      classic variables page
    </Link>
  );
};

export const OAuthVariableField = ({
  projectId,
  service,
  api
}: {
  projectId: string;
  service?: TAgentVaultService;
  api: TServiceFormApi;
}) => {
  const { form, set, err } = api;
  const resources = useV4Adapter("agentVaultResources");
  const { permission } = useProjectPermission(projectId);
  const canList =
    permission.can(
      ProjectPermissionAgentVaultVariableActions.Read,
      ProjectPermissionSub.AgentVaultVariables
    ) &&
    permission.can(
      ProjectPermissionAgentVaultVariableActions.ReadValue,
      ProjectPermissionSub.AgentVaultVariables
    );

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 200);
  const { data, isPending, error } = resources.useVariables(
    projectId,
    {
      scope: AgentVaultVariableScope.Global,
      type: AgentVaultVariableType.OAuth,
      search: debouncedSearch.trim() || undefined,
      limit: 100
    },
    { enabled: canList, refetchOnWindowFocus: true }
  );
  const variables = data?.variables ?? [];
  const selectedKey = form.oauthVariableKey;
  const selectedStatus = variables.find((variable) => variable.key === selectedKey)?.oauth?.status;
  const options: ComboboxOption[] = variables.map((variable) => ({
    value: variable.key,
    label: variable.key,
    meta:
      variable.oauth?.status && variable.oauth.status !== AgentVaultOauthStatus.Connected
        ? OAUTH_STATUS_LABELS[variable.oauth.status]
        : undefined
  }));
  if (selectedKey && !options.some((option) => option.value === selectedKey))
    options.unshift({ value: selectedKey, label: selectedKey });
  const hasNoVariables = Boolean(data) && !variables.length && !debouncedSearch.trim();

  const description = (() => {
    if (!canList)
      return storedOAuthVariableKey(service)
        ? "Changing it takes permission to read variables and their values."
        : "Choosing one takes permission to read variables and their values.";
    if (selectedStatus && selectedStatus !== AgentVaultOauthStatus.Connected)
      return (
        <>
          Agents can&apos;t use this service until {selectedKey} is authorized. Authorize it on the{" "}
          <ClassicVariablesLink projectId={projectId} />.
        </>
      );
    if (hasNoVariables)
      return (
        <>
          This project has no OAuth variables yet. Create and authorize one on the{" "}
          <ClassicVariablesLink projectId={projectId} />, then pick it here.
        </>
      );
    return "The service sends the variable's access token, and refreshes it when it expires.";
  })();

  return (
    <Field label="OAuth variable" description={description} error={err("oauthVariableKey")} wide>
      <Combobox
        label="OAuth variable"
        mono
        placeholder="Select an OAuth variable"
        emptyText={
          error
            ? "Couldn't load OAuth variables. Close this sheet and open it again to retry."
            : "No OAuth variables found."
        }
        options={options}
        value={selectedKey}
        disabled={!canList}
        invalid={Boolean(err("oauthVariableKey"))}
        loading={canList && (isPending || search !== debouncedSearch)}
        onSearch={setSearch}
        onChange={(key) => set("oauthVariableKey", key)}
      />
    </Field>
  );
};
