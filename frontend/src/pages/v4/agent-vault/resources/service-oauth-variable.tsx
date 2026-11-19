import { useEffect, useState } from "react";
import {
  Combobox,
  type ComboboxCreation,
  type ComboboxOption
} from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import axios from "axios";

import {
  BLANK_OAUTH_VARIABLE_FORM,
  buildOAuthVariableSettings,
  CREATE_OAUTH_VARIABLE_TITLE,
  oauthVariableFormIssues,
  type TOAuthVariableFormValues
} from "@app/components/agent-vault/oauthVariableForm";
import {
  OAUTH_STATUS_LABELS,
  storedOAuthVariableKey
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  normalizeVariableKey,
  VARIABLE_KEY_MAX_LENGTH,
  VARIABLE_KEY_MESSAGE,
  VARIABLE_KEY_RE
} from "@app/helpers/agentVaultVariables";
import {
  AgentVaultOauthStatus,
  AgentVaultVariableScope,
  AgentVaultVariableType
} from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { ApiErrorTypes, type TApiErrors } from "@app/hooks/api/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { TServiceFormApi } from "./service-form";

type TCreateFields = Pick<TOAuthVariableFormValues, "serverUrl" | "scopes" | "clientId">;
type TCreateErrors = Partial<Record<"key" | keyof TCreateFields, string>>;

const keyError = (key: string, isTaken: boolean) => {
  if (!key) return "Required";
  if (key.length > VARIABLE_KEY_MAX_LENGTH)
    return `A key can be at most ${VARIABLE_KEY_MAX_LENGTH} characters.`;
  if (!VARIABLE_KEY_RE.test(key)) return VARIABLE_KEY_MESSAGE;
  if (isTaken) return `A variable named '${key}' already exists.`;
  return undefined;
};

const CreateOAuthVariableForm = ({
  projectId,
  formId,
  query,
  onCreated,
  onDirtyChange,
  onPendingChange
}: {
  projectId: string;
  formId: string;
  query: string;
  onCreated: (key: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const create = resources.useCreateVariable(projectId);
  const initialKey = normalizeVariableKey(query);
  const [key, setKey] = useState(initialKey);
  const [fields, setFields] = useState<TCreateFields>({ serverUrl: "", scopes: "", clientId: "" });
  const [errors, setErrors] = useState<TCreateErrors>({});
  const [debouncedKey] = useDebounce(key, 300);
  const lookupKey = debouncedKey === key && VARIABLE_KEY_RE.test(key) ? key : null;
  const { existing } = resources.useVariableKeyStatus(projectId, lookupKey ? [lookupKey] : [], {
    isCached: false
  });
  const isTaken = Boolean(lookupKey && existing.has(lookupKey));

  const isDirty =
    key !== initialKey || Object.values(fields).some((value) => Boolean(value.trim()));
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const edit = (field: keyof TCreateFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  return (
    <form
      id={formId}
      autoComplete="off"
      onSubmit={async (event) => {
        event.preventDefault();
        const values: TOAuthVariableFormValues = { ...BLANK_OAUTH_VARIABLE_FORM, ...fields };
        const next: TCreateErrors = { key: keyError(key, isTaken) };
        oauthVariableFormIssues(values).forEach((issue) => {
          if (issue.field in fields) next[issue.field as keyof TCreateFields] = issue.message;
        });
        setErrors(next);
        if (Object.values(next).some(Boolean)) return;
        onPendingChange(true);
        try {
          const created = await create.mutateAsync({
            scope: AgentVaultVariableScope.Global,
            type: AgentVaultVariableType.OAuth,
            key,
            oauth: buildOAuthVariableSettings(values)
          });
          saved(`Variable ${created.key} created`);
          onCreated(created.key);
        } catch (error) {
          const response = axios.isAxiosError(error)
            ? (error.response?.data as TApiErrors | undefined)
            : undefined;
          if (
            response?.error === ApiErrorTypes.BadRequestError &&
            (response.details as { field?: string } | undefined)?.field === "key"
          )
            setErrors({ key: response.message });
          else failed("Failed to create variable", error);
        } finally {
          onPendingChange(false);
        }
      }}
    >
      <Stack gap={16}>
        <Field
          label="Key"
          description="Services choose it by this key as their OAuth credential."
          error={errors.key ?? (isTaken ? keyError(key, true) : undefined)}
        >
          <Input
            mono
            value={key}
            maxLength={VARIABLE_KEY_MAX_LENGTH}
            placeholder="GOOGLE_DRIVE"
            invalid={Boolean(errors.key) || isTaken}
            onChange={(event) => {
              setKey(normalizeVariableKey(event.target.value));
              setErrors((current) => ({ ...current, key: undefined }));
            }}
          />
        </Field>
        <Field
          label="Server URL"
          description="The MCP server or API whose sign-in this variable holds."
          error={errors.serverUrl}
          wide
        >
          <Input
            mono
            value={fields.serverUrl}
            placeholder="https://mcp.example.com/mcp"
            invalid={Boolean(errors.serverUrl)}
            spellCheck={false}
            onChange={(event) => edit("serverUrl", event.target.value)}
          />
        </Field>
        <Field
          label="Scopes"
          optional
          description="Separate scopes with spaces. Leave empty to use the server's defaults."
          error={errors.scopes}
          wide
        >
          <Input
            mono
            value={fields.scopes}
            invalid={Boolean(errors.scopes)}
            spellCheck={false}
            onChange={(event) => edit("scopes", event.target.value)}
          />
        </Field>
        <Field
          label="Client ID"
          optional
          description="Your own OAuth app's client ID. Leave empty to register a client automatically."
          error={errors.clientId}
          wide
        >
          <Input
            mono
            value={fields.clientId}
            invalid={Boolean(errors.clientId)}
            spellCheck={false}
            onChange={(event) => edit("clientId", event.target.value)}
          />
        </Field>
      </Stack>
    </form>
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
  const canCreate =
    canList &&
    permission.can(
      ProjectPermissionAgentVaultVariableActions.Create,
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
    { enabled: canList }
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

  const creation: ComboboxCreation | undefined =
    canCreate && !error
      ? {
          mode: "dialog",
          label: CREATE_OAUTH_VARIABLE_TITLE,
          title: CREATE_OAUTH_VARIABLE_TITLE,
          description: "The new variable is selected once it is created.",
          submitLabel: "Create variable",
          discardTitle: "Discard OAuth variable?",
          renderForm: ({ query, formId, complete, onDirtyChange, onPendingChange }) => (
            <CreateOAuthVariableForm
              projectId={projectId}
              formId={formId}
              query={query}
              onDirtyChange={onDirtyChange}
              onPendingChange={onPendingChange}
              onCreated={(key) => {
                set("oauthVariableKey", key);
                complete({ value: key, label: key });
              }}
            />
          )
        }
      : undefined;

  const description = (() => {
    if (!canList)
      return storedOAuthVariableKey(service)
        ? "Changing it takes permission to read variables and their values."
        : "Choosing one takes permission to read variables and their values.";
    if (selectedStatus && selectedStatus !== AgentVaultOauthStatus.Connected)
      return `Agents can't use this service until ${selectedKey} is authorized on the Variables page.`;
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
        creation={creation}
      />
    </Field>
  );
};
