import { useState } from "react";
import { Controller, type UseFormReturn, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DurationInput } from "@infisical/cipher/ui/duration-input";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListFooter, ListRow } from "@infisical/cipher/ui/list";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";
import { Link } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import ms from "ms";
import { z } from "zod";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce, useTimedReset } from "@app/hooks";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession,
  TAgentVaultProjectService,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { MetadataEditor } from "../../access/org/metadata-editor";
import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { copyText } from "../../clipboard";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { isNoUniversalAuthError } from "../../data/agent-vault/contract";
import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";
import { PersonalValuesDialog } from "../resources/personal-values-dialog";
import { ServiceGlyph, ServiceIcon } from "../resources/shared";
import { useIdentityCreation } from "./create-identity-dialog";
import {
  codeLanguageForFile,
  createSessionSnippet,
  hasScriptLanguages,
  INSTALL_COMMANDS,
  LANGUAGE_NAMES,
  PLATFORMS,
  resolveScriptLanguage,
  runCommand,
  sandboxScripts,
  ScriptLanguage,
  scriptLanguagesFor,
  ScriptProvider,
  setupPrompt,
  SnippetLanguage
} from "./sandbox";
import {
  currentSiteUrl,
  formatSessionExpiry,
  isSessionServicesError,
  metadataRowsToRecord,
  sessionLabelSchema,
  sessionMetadataRowsSchema
} from "./sessions";

const OWN_SANDBOX = "own";
type TPlatform = ScriptProvider | typeof OWN_SANDBOX;

const CREATE_NOW = "create-now";
type TCreateTab = SnippetLanguage | typeof CREATE_NOW;

const SNIPPET_CODE_LANGUAGES: Record<SnippetLanguage, string> = {
  [SnippetLanguage.TypeScript]: "typescript",
  [SnippetLanguage.Python]: "python",
  [SnippetLanguage.Go]: "go",
  [SnippetLanguage.Cli]: "bash"
};

const SCRIPT_LANGUAGES: Partial<Record<TCreateTab, ScriptLanguage>> = {
  [SnippetLanguage.Python]: ScriptLanguage.Python,
  [SnippetLanguage.Go]: ScriptLanguage.Go
};

const TAB_STORAGE_KEY = "agentVaultCreateSessionTab";
const FORM_ID = "agent-vault-create-session-form";

const NEVER_TTL = "never";
const CUSTOM_TTL = "custom";
const TTL_PRESETS = [
  { value: "1h", label: "1 hour" },
  { value: "8h", label: "8 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: NEVER_TTL, label: "Never" },
  { value: CUSTOM_TTL, label: "Custom" }
];
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

const customTtlError = (value: string) => {
  let parsed: number | undefined;
  try {
    parsed = ms(value.trim() as Parameters<typeof ms>[0]);
  } catch {
    parsed = undefined;
  }
  if (typeof parsed !== "number" || Number.isNaN(parsed)) return "Not a valid duration.";
  if (parsed < MIN_TTL_MS) return "At least 1 minute.";
  if (parsed > MAX_TTL_MS) return "At most 100 years. Pick Never for no expiry.";
  return undefined;
};

const isCreateTab = (value: unknown): value is TCreateTab =>
  value === CREATE_NOW || Object.values(SnippetLanguage).includes(value as SnippetLanguage);

const readStoredTab = (): TCreateTab => {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return isCreateTab(stored) ? stored : SnippetLanguage.TypeScript;
  } catch {
    return SnippetLanguage.TypeScript;
  }
};

const storeTab = (value: string) => {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, value);
  } catch {
    // Storage can be blocked, such as in a private window; the choice just isn't remembered.
  }
};

type TIdentity = { id: string; name: string; role?: string };

const PLATFORM_OPTIONS: { value: TPlatform; name: string; logo?: string }[] = [
  ...Object.values(ScriptProvider).map((value) => ({
    value,
    name: PLATFORMS[value].name,
    logo: PLATFORMS[value].logo
  })),
  { value: OWN_SANDBOX, name: "Your own sandbox" }
];

const CopyPromptButton = ({ prompt }: { prompt: string }) => {
  const [, isCopied, setCopied] = useTimedReset<string>({ initialState: "" });
  return (
    <Button
      variant="accent"
      icon={isCopied ? "check" : "copy"}
      onClick={async () => {
        if (await copyText(prompt)) setCopied("copied");
      }}
    >
      {isCopied ? "Copied" : "Copy prompt"}
    </Button>
  );
};

const SandboxFiles = ({
  platform,
  language,
  onLanguageChange,
  values
}: {
  platform: ScriptProvider;
  language: ScriptLanguage;
  onLanguageChange: (language: ScriptLanguage) => void;
  values: { siteUrl: string; projectId: string; accessBundle: string };
}) => {
  const scripts = sandboxScripts(platform, language, values);
  const [fileIndex, setFileIndex] = useState(0);
  const activeIndex = Math.min(fileIndex, scripts.length - 1);
  const activeScript = scripts[activeIndex];

  return (
    <Stack gap={12}>
      {hasScriptLanguages(platform) && (
        <Tabs
          label="Language"
          variant="segmented"
          value={language}
          onValueChange={(value) => onLanguageChange(value as ScriptLanguage)}
          tabs={scriptLanguagesFor(platform).map((value) => ({
            value,
            label: LANGUAGE_NAMES[value]
          }))}
        />
      )}
      <Tabs
        label="Files"
        value={String(activeIndex)}
        onValueChange={(value) => setFileIndex(Number(value))}
        tabs={scripts.map((script, index) => ({ value: String(index), label: script.fileName }))}
      />
      {activeScript && (
        <CodeBlock
          key={activeScript.fileName}
          label={activeScript.fileName}
          code={activeScript.code}
          language={codeLanguageForFile(activeScript.fileName)}
          maxHeight={480}
        />
      )}
    </Stack>
  );
};

const IdentityLink = ({
  orgId,
  projectId,
  identityId,
  children
}: {
  orgId: string;
  projectId: string;
  identityId: string;
  children: React.ReactNode;
}) => (
  <Button variant="link" asChild>
    <Link
      to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/identities/$identityId")}
      params={{ orgId, projectId, identityId }}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </Link>
  </Button>
);

const IdentityDescription = ({
  orgId,
  projectId,
  identity,
  isOwnSandbox,
  hasClientIdError
}: {
  orgId: string;
  projectId: string;
  identity: TIdentity | null;
  isOwnSandbox: boolean;
  hasClientIdError: boolean;
}) => {
  if (!identity)
    return isOwnSandbox
      ? "Your code creates sessions as a machine identity. Pick one to fill in its client ID below."
      : "Your code creates sessions as a machine identity. Pick one to see the credentials the files below need.";
  const link = (text: string) => (
    <IdentityLink orgId={orgId} projectId={projectId} identityId={identity.id}>
      {text}
    </IdentityLink>
  );
  if (!isOwnSandbox)
    return (
      <>
        The files below read credentials from environment variables. Set them to {identity.name}
        &apos;s client ID and one of its {link("client secrets")}.
      </>
    );
  if (hasClientIdError)
    return (
      <>
        Couldn&apos;t load {identity.name}&apos;s client ID, so the snippets below show{" "}
        <Code>&lt;client-id&gt;</Code>. Find it on {link(`${identity.name}'s page`)}.
      </>
    );
  return (
    <>
      The snippets below have {identity.name}&apos;s client ID. Replace{" "}
      <Code>&lt;client-secret&gt;</Code> with one of its {link("client secrets")}.
    </>
  );
};

const MAX_NAMED_SERVICES = 50;
const SERVICE_PICKER_LIMIT = 50;
const PICK_SOMETHING_ERROR = "pickSomething";

const createNowSchema = z
  .object({
    services: z.custom<TAgentVaultProjectService[]>(),
    label: sessionLabelSchema,
    metadata: sessionMetadataRowsSchema,
    ttlPreset: z.string(),
    customTtl: z.string()
  })
  .superRefine(({ services, ttlPreset, customTtl }, ctx) => {
    if (services.length > MAX_NAMED_SERVICES)
      ctx.addIssue({
        code: "custom",
        path: ["services"],
        message: `A session can name up to ${MAX_NAMED_SERVICES} services. Remove ${
          services.length - MAX_NAMED_SERVICES
        } to continue.`
      });
    if (ttlPreset !== CUSTOM_TTL) return;
    const message = customTtlError(customTtl);
    if (message) ctx.addIssue({ code: "custom", path: ["customTtl"], message });
  });

type TCreateNowForm = z.infer<typeof createNowSchema>;

const CREATE_NOW_DEFAULTS: TCreateNowForm = {
  services: [],
  label: "",
  metadata: [],
  ttlPreset: "7d",
  customTtl: ""
};

type TCreateNowValues = {
  ttl: string;
  label?: string;
  metadata?: Record<string, string>;
  services: string[];
};

type TCreateNowResult = { servicesError?: string } | undefined;

const ServicesField = ({
  projectId,
  value,
  error,
  onChange
}: {
  projectId: string;
  value: TAgentVaultProjectService[];
  error?: string;
  onChange: (services: TAgentVaultProjectService[]) => void;
}) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isFetching } = useV4Adapter("agentVaultResources").useServices(projectId, {
    search: debouncedSearch.trim() || undefined,
    orderBy: "name",
    orderDirection: "asc",
    limit: SERVICE_PICKER_LIMIT
  });
  const listed = data?.services ?? [];
  const selectedIds = new Set(value.map((service) => service.id));
  const known = [...value, ...listed.filter((service) => !selectedIds.has(service.id))];
  return (
    <Field
      label="Services"
      error={error}
      description="The project's services this session reaches, beside or instead of an access bundle."
    >
      <MultiSelect
        label="Services"
        placeholder="Pick services"
        searchPlaceholder="Search services"
        invalid={Boolean(error)}
        loading={isFetching}
        onSearch={setSearch}
        options={known.map((service) => ({
          value: service.id,
          label: service.name,
          description: service.description ?? undefined,
          media: <ServiceGlyph hostPattern={hostPatternOf(service)} serviceType={service.type} />
        }))}
        value={value.map((service) => service.id)}
        onChange={(ids) => {
          const picked = new Set(ids);
          onChange(known.filter((service) => picked.has(service.id)));
        }}
      />
    </Field>
  );
};

const useServicesNeedingSetup = (
  projectId: string,
  accessBundle: TAgentVaultAccessBundleListItem | null,
  selectedServices: TAgentVaultProjectService[]
) => {
  const { data: servicesRequiringSetup } = useV4Adapter(
    "agentVaultResources"
  ).useAllServicesRequiringSetup(projectId, { enabled: selectedServices.length > 0 });
  const details = useV4Adapter("agentVaultResources").useAccessBundle(
    projectId,
    accessBundle?.id ?? ""
  );
  const detailedNeedsSetup =
    accessBundle && details.data?.id === accessBundle.id
      ? details.data.services.filter(
          (service) => service.personalValues && !service.personalValues.isConfigured
        )
      : undefined;
  const isDetailsFailed = !detailedNeedsSetup && Boolean(details.error);
  const bundleNeedsSetup: (Pick<TAgentVaultService, "id" | "name"> &
    Partial<TAgentVaultService>)[] =
    detailedNeedsSetup ?? accessBundle?.servicesRequiringSetup ?? [];
  const pickedIds = new Set(selectedServices.map((service) => service.id));
  const bundleIds = new Set(bundleNeedsSetup.map((service) => service.id));
  const pickedNeedsSetup = (servicesRequiringSetup ?? []).filter(
    (service) => pickedIds.has(service.id) && !bundleIds.has(service.id)
  );
  const needsSetup = [...bundleNeedsSetup, ...pickedNeedsSetup];
  return { details, detailedNeedsSetup, isDetailsFailed, needsSetup, pickedNeedsSetup };
};

const NeedsSetupNotice = ({
  orgId,
  projectId,
  accessBundle,
  selectedServices
}: {
  orgId: string;
  projectId: string;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  selectedServices: TAgentVaultProjectService[];
}) => {
  const { details, detailedNeedsSetup, isDetailsFailed, needsSetup, pickedNeedsSetup } =
    useServicesNeedingSetup(projectId, accessBundle, selectedServices);
  const shownNeedsSetup = needsSetup.length > 4 ? needsSetup.slice(0, 3) : needsSetup;
  const hiddenNeedsSetupCount = needsSetup.length - shownNeedsSetup.length;
  const [settingUp, setSettingUp] = useState<TAgentVaultService>();
  const setUpBlockedReason = (type?: TAgentVaultService["type"]) => {
    if (type) return undefined;
    return isDetailsFailed ? "Couldn't load this service" : "Loading this service";
  };

  if (!needsSetup.length) return null;
  return (
    <>
      <Stack gap={8}>
        <Alert
          tone="warn"
          title={
            needsSetup.length === 1
              ? "1 service requires your personal values"
              : `${needsSetup.length} services require your personal values`
          }
        >
          {needsSetup.length === 1
            ? "Until you set it up, this session can't reach it."
            : "Until you set them up, this session can't reach them."}
        </Alert>
        {isDetailsFailed && (
          <Alert
            tone="bad"
            actions={
              <Button
                variant="outline"
                size="sm"
                loading={details.isFetching}
                onClick={() => details.refetch?.()}
              >
                Retry
              </Button>
            }
          >
            Couldn&apos;t load these services, so they can&apos;t be set up here yet.
          </Alert>
        )}
        <List label="Services that require your personal values" variant="framed" size="sm">
          {shownNeedsSetup.map((service) => (
            <ListRow
              key={service.id}
              value={service.id}
              label={service.name}
              title={service.name}
              media={
                service.type ? (
                  <ServiceIcon
                    hostPattern={hostPatternOf(service as TAgentVaultService)}
                    serviceType={service.type}
                  />
                ) : (
                  <Skeleton width={24} height={24} />
                )
              }
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  disabledReason={setUpBlockedReason(service.type)}
                  onClick={() => service.type && setSettingUp(service as TAgentVaultService)}
                >
                  Set up
                </Button>
              }
            />
          ))}
          {hiddenNeedsSetupCount > 0 && (
            <ListFooter>
              <Button variant="link" underline="hover" asChild>
                {accessBundle && !pickedNeedsSetup.length ? (
                  <Link
                    to={v4Path(
                      "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
                    )}
                    params={{ orgId, projectId, accessBundleId: accessBundle.id }}
                  >
                    {`${hiddenNeedsSetupCount} more in ${accessBundle.name}`}
                  </Link>
                ) : (
                  <Link
                    to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/services")}
                    params={{ orgId, projectId }}
                    search={{ requiresSetup: true }}
                  >
                    {`${hiddenNeedsSetupCount} more on the Services page`}
                  </Link>
                )}
              </Button>
            </ListFooter>
          )}
        </List>
      </Stack>
      <PersonalValuesDialog
        projectId={projectId}
        service={
          settingUp && (detailedNeedsSetup?.find(({ id }) => id === settingUp.id) ?? settingUp)
        }
        onOpenChange={(isOpen) => !isOpen && setSettingUp(undefined)}
      />
    </>
  );
};

const CreateNowForm = ({
  form,
  orgId,
  projectId,
  accessBundle,
  onCreate
}: {
  form: UseFormReturn<TCreateNowForm>;
  orgId: string;
  projectId: string;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  onCreate: (values: TCreateNowValues) => Promise<TCreateNowResult>;
}) => {
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = form;
  const ttlPreset = useWatch({ control, name: "ttlPreset" });
  const selectedServices = useWatch({ control, name: "services" });
  const submit = async (values: TCreateNowForm) => {
    if (!accessBundle && !values.services.length) {
      setError("services", {
        type: PICK_SOMETHING_ERROR,
        message: "Pick an access bundle or at least one service."
      });
      return;
    }
    const metadata = metadataRowsToRecord(values.metadata);
    const result = await onCreate({
      services: values.services.map((service) => service.name),
      ttl: values.ttlPreset === CUSTOM_TTL ? values.customTtl.trim() : values.ttlPreset,
      label: values.label || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    });
    if (result?.servicesError)
      setError("services", { type: "server", message: result.servicesError });
  };
  const metadataRowErrors = Array.isArray(errors.metadata)
    ? errors.metadata.map((row) => ({ key: row?.key?.message, value: row?.value?.message }))
    : undefined;
  const metadataListError =
    errors.metadata?.root?.message ??
    errors.metadata?.message ??
    metadataRowErrors?.map((row) => row.key ?? row.value).find(Boolean);

  return (
    <Stack gap={16}>
      <form id={FORM_ID} onSubmit={handleSubmit(submit)}>
        <Stack gap={16}>
          <Controller
            control={control}
            name="services"
            render={({ field, fieldState }) => (
              <ServicesField
                projectId={projectId}
                value={field.value}
                error={fieldState.error?.message}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="label"
            render={({ field, fieldState }) => (
              <Field label="Label" optional error={fieldState.error?.message}>
                <Input
                  {...field}
                  placeholder="Nightly deploy"
                  invalid={Boolean(fieldState.error)}
                />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="metadata"
            render={({ field }) => (
              <Field error={metadataListError}>
                <MetadataEditor
                  addLabel="Add metadata"
                  entries={field.value}
                  errors={metadataRowErrors}
                  onChange={field.onChange}
                />
              </Field>
            )}
          />
          <Field
            label="Expires"
            error={errors.customTtl?.message}
            description={
              ttlPreset === NEVER_TTL ? "This session runs until someone revokes it." : undefined
            }
          >
            <Stack gap={8}>
              <Controller
                control={control}
                name="ttlPreset"
                render={({ field }) => (
                  <Select
                    label="Expires"
                    value={field.value}
                    options={TTL_PRESETS}
                    onChange={field.onChange}
                  />
                )}
              />
              {ttlPreset === CUSTOM_TTL && (
                <Controller
                  control={control}
                  name="customTtl"
                  render={({ field, fieldState }) => (
                    <DurationInput
                      aria-label="Custom expiry"
                      value={field.value}
                      invalid={Boolean(fieldState.error)}
                      placeholder="90"
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </Stack>
          </Field>
        </Stack>
      </form>
      <NeedsSetupNotice
        orgId={orgId}
        projectId={projectId}
        accessBundle={accessBundle}
        selectedServices={selectedServices}
      />
    </Stack>
  );
};

const GrantAccessAlert = ({
  orgId,
  projectId,
  identity,
  accessBundle
}: {
  orgId: string;
  projectId: string;
  identity: TIdentity;
  accessBundle: TAgentVaultAccessBundleListItem;
}) => {
  const agentVault = useV4Adapter("agentVault");
  const { permission } = useProjectPermission(projectId);
  // The grant check reads the bundle's members, which takes ManageMembers, as does granting from the warning.
  const canManageBundleMembers = permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
    ProjectPermissionSub.AgentVaultAccessBundles
  );
  const { data: isGranted } = agentVault.useIsAccessBundleMember(
    orgId,
    projectId,
    accessBundle.id,
    canManageBundleMembers
      ? { type: AgentVaultMemberType.MachineIdentity, id: identity.id, name: identity.name }
      : null
  );
  const grant = agentVault.useGrantAccessBundle(orgId, projectId);

  if (
    !canManageBundleMembers ||
    isGranted !== false ||
    identity.role === ProjectMembershipRole.Admin
  )
    return null;

  const onGrant = async () => {
    try {
      await grant.mutateAsync({
        accessBundleId: accessBundle.id,
        machineIdentityIds: [identity.id]
      });
      saved(`Granted ${accessBundle.name} to ${identity.name}`);
    } catch (error) {
      failed("Failed to grant the access bundle", error);
    }
  };

  return (
    <Alert
      tone="warn"
      title={`${identity.name} can't use ${accessBundle.name}`}
      actions={
        <Button variant="outline" size="sm" loading={grant.isPending} onClick={onGrant}>
          Grant access
        </Button>
      }
    >
      Creating a session fails until the access bundle is granted to it.
    </Alert>
  );
};

const MachineIdentityFields = ({
  orgId,
  projectId,
  isOwnSandbox,
  open,
  accessBundle,
  identity,
  onIdentityChange,
  universalAuthError
}: {
  orgId: string;
  projectId: string;
  isOwnSandbox: boolean;
  open: boolean;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  identity: TIdentity | null;
  onIdentityChange: (identity: TIdentity | null) => void;
  universalAuthError: unknown;
}) => {
  const agentVault = useV4Adapter("agentVault");
  const identityCreation = useIdentityCreation(projectId, onIdentityChange);
  const [identitySearch, setIdentitySearch] = useState("");
  const [debouncedIdentitySearch] = useDebounce(identitySearch);
  const { data: identities, isPending: isSearchingIdentities } = agentVault.useMembers(
    projectId,
    {
      actorType: AgentVaultMemberType.MachineIdentity,
      search: debouncedIdentitySearch.trim() || undefined,
      limit: 50
    },
    open
  );
  const hasNoUniversalAuth = Boolean(identity) && isNoUniversalAuthError(universalAuthError);
  const hasClientIdError = Boolean(identity && universalAuthError) && !hasNoUniversalAuth;

  const identityOptions = (identities?.members ?? []).map((member) => ({
    value: member.id,
    label: member.name
  }));
  if (identity && !identityOptions.some((option) => option.value === identity.id))
    identityOptions.unshift({ value: identity.id, label: identity.name });

  return (
    <>
      <Field
        label="Machine identity"
        description={
          identity && hasNoUniversalAuth ? undefined : (
            <IdentityDescription
              orgId={orgId}
              projectId={projectId}
              identity={identity}
              isOwnSandbox={isOwnSandbox}
              hasClientIdError={hasClientIdError}
            />
          )
        }
      >
        <Combobox
          label="Machine identity"
          placeholder="Pick a machine identity"
          emptyText="No machine identity matches."
          options={identityOptions}
          value={identity?.id ?? ""}
          loading={isSearchingIdentities}
          onSearch={setIdentitySearch}
          clearable
          onChange={(id) => {
            if (!id) {
              onIdentityChange(null);
              return;
            }
            const member = identities?.members.find((entry) => entry.id === id);
            if (member) onIdentityChange({ id: member.id, name: member.name, role: member.role });
          }}
          creation={identityCreation.creation}
        />
      </Field>
      {identityCreation.dialog}
      {identity && hasNoUniversalAuth && (
        <Alert tone="warn">
          {identity.name} doesn&apos;t use Universal Auth, so it has no client ID. Add Universal
          Auth on{" "}
          <IdentityLink orgId={orgId} projectId={projectId} identityId={identity.id}>
            {identity.name}&apos;s page
          </IdentityLink>
          .
        </Alert>
      )}
      {identity && accessBundle && (
        <GrantAccessAlert
          orgId={orgId}
          projectId={projectId}
          identity={identity}
          accessBundle={accessBundle}
        />
      )}
    </>
  );
};

const AccessBundleField = ({
  orgId,
  projectId,
  accessBundle,
  disabled,
  isCreateNow,
  onChange
}: {
  orgId: string;
  projectId: string;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  disabled: boolean;
  isCreateNow: boolean;
  onChange: (accessBundle: TAgentVaultAccessBundleListItem | null) => void;
}) => {
  const agentVault = useV4Adapter("agentVault");
  const [bundleSearch, setBundleSearch] = useState("");
  const [debouncedBundleSearch] = useDebounce(bundleSearch);
  const { data: bundles, isFetching: isSearchingBundles } = agentVault.useAccessBundles(
    orgId,
    projectId,
    {
      search: debouncedBundleSearch.trim() || undefined,
      orderBy: "name",
      orderDirection: "asc",
      limit: 50
    }
  );
  const bundleOptions = (bundles?.accessBundles ?? []).map((bundle) => ({
    value: bundle.id,
    label: bundle.name
  }));
  if (accessBundle && !bundleOptions.some((option) => option.value === accessBundle.id))
    bundleOptions.unshift({ value: accessBundle.id, label: accessBundle.name });

  return (
    <Field
      label="Access bundle"
      description={
        isCreateNow
          ? "Optional when you pick services below."
          : "The services an agent can reach with this session."
      }
    >
      <Combobox
        label="Access bundle"
        placeholder="Pick an access bundle"
        emptyText="No access bundle matches."
        options={bundleOptions}
        value={accessBundle?.id ?? ""}
        loading={isSearchingBundles}
        onSearch={setBundleSearch}
        clearable
        disabled={disabled}
        onChange={(id) =>
          onChange(bundles?.accessBundles.find((bundle) => bundle.id === id) ?? null)
        }
      />
    </Field>
  );
};

const CreatedSessionCommand = ({
  session,
  siteUrl
}: {
  session: TAgentVaultMintedSession;
  siteUrl: string;
}) => (
  <Stack gap={8}>
    <Alert tone="warn">
      This command is shown once. Copy it now, since the session token cannot be retrieved later.
    </Alert>
    <CodeBlock
      label="Run an agent with it"
      language="bash"
      code={runCommand(session.token, siteUrl)}
    />
    <SmallText muted>
      Run it where your agent runs. Replace <Code>&lt;proxy-host&gt;</Code> with the host your proxy
      runs on and <Code>&lt;agent-command&gt;</Code> with the agent to run, such as{" "}
      <Code>claude</Code>.{" "}
      {session.expiresAt
        ? `The session expires ${formatSessionExpiry(session.expiresAt)}.`
        : "The session lasts until someone revokes it."}
    </SmallText>
  </Stack>
);

const PlatformPicker = ({ onPick }: { onPick: (platform: TPlatform) => void }) => (
  <>
    <SheetHeader>
      <SheetTitle>Create session</SheetTitle>
      <SheetDescription>
        An agent running with this session can only reach the services it was created with.
      </SheetDescription>
    </SheetHeader>
    <SheetBody>
      <RadioGroup
        aria-label="Where your agent runs"
        columns={2}
        value=""
        onValueChange={(value) => onPick(value as TPlatform)}
      >
        {PLATFORM_OPTIONS.map((option) => (
          <RadioGroupCard
            key={option.value}
            value={option.value}
            title={option.name}
            media={
              option.logo ? (
                <ProviderIcon icon={option.logo} alt="" size="sm" />
              ) : (
                <Icon name="server" />
              )
            }
          />
        ))}
      </RadioGroup>
    </SheetBody>
  </>
);

const SessionSnippets = ({ language, code }: { language: SnippetLanguage; code: string }) => (
  <>
    <CodeBlock label="Install" language="bash" code={INSTALL_COMMANDS[language]} />
    <Stack gap={8}>
      <CodeBlock label="Create a session" language={SNIPPET_CODE_LANGUAGES[language]} code={code} />
      <SmallText muted>
        {language === SnippetLanguage.Cli ? (
          <>
            The command stores the session token in <Code>INFISICAL_AGENT_VAULT_SESSION_TOKEN</Code>
            , where <Code>infisical agent-vault run</Code> reads it.
          </>
        ) : (
          "Revoking the session when the agent finishes stops its credentials from working, even if the agent fails."
        )}
      </SmallText>
    </Stack>
  </>
);

const NoProxyAlert = ({ orgId, projectId }: { orgId: string; projectId: string }) => (
  <Alert
    tone="info"
    actions={
      <Button variant="outline" size="sm" asChild>
        <Link
          to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/proxies")}
          params={{ orgId, projectId }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Create a proxy
        </Link>
      </Button>
    }
  >
    Agents reach their services through a proxy, and this project has none yet.
  </Alert>
);

const PlatformHeader = ({ platform }: { platform: (typeof PLATFORMS)[ScriptProvider] | null }) => (
  <SheetHeader>
    <SheetTitle
      badges={
        platform && (
          <DocumentationLink href={platform.guideUrl} subject={`${platform.name} setup`} />
        )
      }
    >
      <Inline gap={8} align="center" wrap={false}>
        {platform ? <ProviderIcon icon={platform.logo} alt="" size="sm" /> : <Icon name="server" />}
        {platform?.name ?? "Your own sandbox"}
      </Inline>
    </SheetTitle>
    <SheetDescription>
      {platform?.description ??
        "Create sessions from your own code, wherever your agent runs, or create one here to try it out."}
    </SheetDescription>
  </SheetHeader>
);

const GuideActions = ({
  platform,
  prompt
}: {
  platform: ScriptProvider;
  prompt: {
    language: ScriptLanguage;
    siteUrl: string;
    projectId: string;
    accessBundle: string;
    clientId: string | null;
  };
}) => {
  return (
    <CopyPromptButton
      prompt={setupPrompt(PLATFORMS[platform], {
        ...prompt,
        language: hasScriptLanguages(platform) ? prompt.language : undefined
      })}
    />
  );
};

const SessionFields = ({
  orgId,
  projectId,
  isCreateNow,
  isOwnSandbox,
  open,
  isLocked,
  accessBundle,
  onAccessBundleChange,
  identity,
  onIdentityChange,
  universalAuthError
}: {
  orgId: string;
  projectId: string;
  isCreateNow: boolean;
  isOwnSandbox: boolean;
  open: boolean;
  isLocked: boolean;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  onAccessBundleChange: (accessBundle: TAgentVaultAccessBundleListItem | null) => void;
  identity: TIdentity | null;
  onIdentityChange: (identity: TIdentity | null) => void;
  universalAuthError: unknown;
}) => {
  const { user } = useV4Session();
  const { permission } = useProjectPermission(projectId);
  // The picker lists the project's machine identities, which takes Read on them.
  const canPickIdentity = permission.can(
    ProjectPermissionIdentityActions.Read,
    ProjectPermissionSub.Identity
  );
  return (
    <Stack gap={16}>
      <AccessBundleField
        orgId={orgId}
        projectId={projectId}
        accessBundle={accessBundle}
        disabled={isLocked}
        isCreateNow={isCreateNow}
        onChange={onAccessBundleChange}
      />
      {isCreateNow && (
        <Field label="Created as" description="Sessions you create here are attributed to you.">
          <Inline gap={8} align="center" wrap={false}>
            <Icon name="user" />
            <span>{user.name || user.email}</span>
          </Inline>
        </Field>
      )}
      {!isCreateNow && !canPickIdentity && (
        <Field
          label="Machine identity"
          description="Your code creates sessions as a machine identity. Ask an Agent Vault admin for the client ID and client secret of one that's granted this access bundle."
        />
      )}
      {!isCreateNow && canPickIdentity && (
        <MachineIdentityFields
          orgId={orgId}
          projectId={projectId}
          isOwnSandbox={isOwnSandbox}
          open={open}
          accessBundle={accessBundle}
          identity={identity}
          onIdentityChange={onIdentityChange}
          universalAuthError={universalAuthError}
        />
      )}
    </Stack>
  );
};

const CreateSessionFooter = ({
  platform,
  isOwnSandbox,
  isCreateNow,
  created,
  isPending,
  prompt,
  onBack,
  onDone
}: {
  platform: TPlatform;
  isOwnSandbox: boolean;
  isCreateNow: boolean;
  created: boolean;
  isPending: boolean;
  prompt: React.ComponentProps<typeof GuideActions>["prompt"];
  onBack: () => void;
  onDone: () => void;
}) => (
  <SheetFooter>
    <Inline gap={8} justify="end">
      {!created && (
        <Button variant="ghost" disabled={isPending} onClick={onBack}>
          Back
        </Button>
      )}
      <Inline gap={8} justify="end">
        {platform !== OWN_SANDBOX && <GuideActions platform={platform} prompt={prompt} />}
        {isCreateNow && !created && (
          <Button variant="accent" type="submit" form={FORM_ID} loading={isPending}>
            Create session
          </Button>
        )}
        {isOwnSandbox && (!isCreateNow || created) && (
          <Button variant="accent" onClick={onDone}>
            Done
          </Button>
        )}
      </Inline>
    </Inline>
  </SheetFooter>
);

const OwnSandboxBody = ({
  form,
  fields,
  tab,
  onTabChange,
  created,
  isCreateNow,
  language,
  snippet,
  siteUrl,
  orgId,
  projectId,
  accessBundle,
  onCreate
}: {
  form: UseFormReturn<TCreateNowForm>;
  fields: React.ReactNode;
  tab: TCreateTab;
  onTabChange: (value: string) => void;
  created: TAgentVaultMintedSession | null;
  isCreateNow: boolean;
  language: SnippetLanguage;
  snippet: string;
  siteUrl: string;
  orgId: string;
  projectId: string;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  onCreate: (values: TCreateNowValues) => Promise<TCreateNowResult>;
}) => (
  <Stack gap={16}>
    {fields}
    <Tabs
      label="How to create the session"
      variant="segmented"
      value={tab}
      onValueChange={onTabChange}
      tabs={[
        { value: SnippetLanguage.TypeScript, label: "TypeScript", disabled: Boolean(created) },
        { value: SnippetLanguage.Python, label: "Python", disabled: Boolean(created) },
        { value: SnippetLanguage.Go, label: "Go", disabled: Boolean(created) },
        { value: SnippetLanguage.Cli, label: "CLI", disabled: Boolean(created) },
        { value: CREATE_NOW, label: "Create now" }
      ]}
    />
    {created && <CreatedSessionCommand session={created} siteUrl={siteUrl} />}
    {!created && isCreateNow && (
      <CreateNowForm
        form={form}
        orgId={orgId}
        projectId={projectId}
        accessBundle={accessBundle}
        onCreate={onCreate}
      />
    )}
    {!isCreateNow && <SessionSnippets language={language} code={snippet} />}
  </Stack>
);

const clientIdFor = (
  identity: TIdentity | null,
  universalAuth: { identityId: string; clientId: string } | undefined
) => (identity && universalAuth?.identityId === identity.id ? universalAuth.clientId : null);

const createView = (platform: TPlatform | null, tab: TCreateTab) => {
  const isOwnSandbox = platform === OWN_SANDBOX;
  const preferredScriptLanguage = SCRIPT_LANGUAGES[tab] ?? ScriptLanguage.TypeScript;
  return {
    isOwnSandbox,
    isCreateNow: isOwnSandbox && tab === CREATE_NOW,
    language: tab === CREATE_NOW ? SnippetLanguage.Cli : tab,
    scriptLanguage:
      !platform || isOwnSandbox
        ? preferredScriptLanguage
        : resolveScriptLanguage(platform, preferredScriptLanguage),
    platformDetails: platform && platform !== OWN_SANDBOX ? PLATFORMS[platform] : null
  };
};

export const CreateSessionSheet = ({
  orgId,
  projectId,
  open,
  onOpenChange
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const agentVault = useV4Adapter("agentVault");
  const { permission } = useProjectPermission(projectId);
  // The no-proxy notice reads the proxy list, so without Read on proxies it stays hidden.
  const canReadProxies = permission.can(
    ProjectPermissionAgentVaultProxyActions.Read,
    ProjectPermissionSub.AgentVaultProxies
  );
  const [platform, setPlatform] = useState<TPlatform | null>(null);
  const [tab, setTab] = useState<TCreateTab>(readStoredTab);
  const [created, setCreated] = useState<TAgentVaultMintedSession | null>(null);
  const [accessBundle, setAccessBundle] = useState<TAgentVaultAccessBundleListItem | null>(null);
  const [identity, setIdentity] = useState<TIdentity | null>(null);

  const createNowForm = useForm<TCreateNowForm>({
    resolver: zodResolver(createNowSchema),
    defaultValues: CREATE_NOW_DEFAULTS
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      createNowForm.reset(CREATE_NOW_DEFAULTS);
      setPlatform(null);
      setCreated(null);
      setAccessBundle(null);
      setIdentity(null);
    }
  }

  const { data: proxies } = agentVault.useProxies(
    orgId,
    projectId,
    { limit: 1 },
    { enabled: open && canReadProxies, refetchOnWindowFocus: "always" }
  );
  const universalAuth = agentVault.useIdentityUniversalAuth(identity?.id ?? "");
  const createSession = agentVault.useCreateSession(orgId, projectId);

  const hasNoProxy = proxies?.totalCount === 0;
  const clientId = clientIdFor(identity, universalAuth.data);
  const siteUrl = currentSiteUrl();
  const accessBundleName = accessBundle?.name ?? "<access-bundle-name>";
  const { isOwnSandbox, isCreateNow, language, scriptLanguage, platformDetails } = createView(
    platform,
    tab
  );
  const isLocked = Boolean(created);

  const onTabChange = (value: string) => {
    if (!isCreateTab(value)) return;
    setTab(value);
    storeTab(value);
  };

  const onAccessBundleChange = (next: TAgentVaultAccessBundleListItem | null) => {
    setAccessBundle(next);
    if (next && createNowForm.getFieldState("services").error?.type === PICK_SOMETHING_ERROR)
      createNowForm.clearErrors("services");
  };

  const onCreate = async ({ services, ...values }: TCreateNowValues): Promise<TCreateNowResult> => {
    try {
      const session = await createSession.mutateAsync({
        accessBundle: accessBundle?.name,
        services: services.length ? services : undefined,
        ...values
      });
      saved("Session created");
      setCreated(session);
      return undefined;
    } catch (error) {
      const message = isAxiosError<{ message?: string }>(error)
        ? error.response?.status === 400 && error.response.data?.message
        : undefined;
      if (services.length && message && isSessionServicesError(message))
        return { servicesError: message };
      failed("Failed to create session", error);
      return undefined;
    }
  };

  const values = (
    <SessionFields
      orgId={orgId}
      projectId={projectId}
      isCreateNow={isCreateNow}
      isOwnSandbox={isOwnSandbox}
      open={open}
      isLocked={isLocked}
      accessBundle={accessBundle}
      onAccessBundleChange={onAccessBundleChange}
      identity={identity}
      onIdentityChange={setIdentity}
      universalAuthError={universalAuth.error}
    />
  );

  const createSnippet = createSessionSnippet(language, {
    siteUrl,
    projectId,
    accessBundle: accessBundleName,
    clientId: clientId ?? "<client-id>",
    clientSecret: "<client-secret>"
  });

  const ownSandbox = (
    <OwnSandboxBody
      form={createNowForm}
      fields={values}
      tab={tab}
      onTabChange={onTabChange}
      created={created}
      isCreateNow={isCreateNow}
      language={language}
      snippet={createSnippet}
      siteUrl={siteUrl}
      orgId={orgId}
      projectId={projectId}
      accessBundle={accessBundle}
      onCreate={onCreate}
    />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="lg"
        pending={createSession.isPending}
        onInteractOutside={(event) => {
          if (created) event.preventDefault();
        }}
      >
        {platform === null ? (
          <PlatformPicker onPick={setPlatform} />
        ) : (
          <>
            <PlatformHeader platform={platformDetails} />
            <SheetBody>
              <Stack gap={16}>
                {hasNoProxy && <NoProxyAlert orgId={orgId} projectId={projectId} />}
                {platform === OWN_SANDBOX ? (
                  ownSandbox
                ) : (
                  <Stack gap={16}>
                    {values}
                    <SandboxFiles
                      key={platform}
                      platform={platform}
                      language={scriptLanguage}
                      onLanguageChange={onTabChange}
                      values={{ siteUrl, projectId, accessBundle: accessBundleName }}
                    />
                  </Stack>
                )}
              </Stack>
            </SheetBody>
            <CreateSessionFooter
              platform={platform}
              isOwnSandbox={isOwnSandbox}
              isCreateNow={isCreateNow}
              created={Boolean(created)}
              isPending={createSession.isPending}
              prompt={{
                language: scriptLanguage,
                siteUrl,
                projectId,
                accessBundle: accessBundleName,
                clientId
              }}
              onBack={() => setPlatform(null)}
              onDone={() => onOpenChange(false)}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
