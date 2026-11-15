import { useState } from "react";
import { Controller, type UseFormReturn, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DurationInput } from "@infisical/cipher/ui/duration-input";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListFooter, ListRow } from "@infisical/cipher/ui/list";
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
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";
import { Link } from "@tanstack/react-router";
import ms from "ms";
import { z } from "zod";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce, useTimedReset } from "@app/hooks";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { isNoUniversalAuthError } from "../../data/agent-vault/contract";
import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";
import { PersonalValuesDialog } from "../resources/personal-values-dialog";
import { ServiceIcon } from "../resources/shared";
import { CreateIdentityForm } from "./create-identity-form";
import {
  codeLanguageForFile,
  createSessionSnippet,
  hasScriptLanguages,
  INSTALL_COMMANDS,
  LANGUAGE_NAMES,
  PLATFORMS,
  runCommand,
  sandboxScripts,
  ScriptLanguage,
  ScriptProvider,
  setupPrompt,
  SnippetLanguage
} from "./sandbox";
import { currentSiteUrl, formatSessionExpiry, sessionLabelSchema } from "./sessions";

const OWN_SANDBOX = "own";
type TPlatform = ScriptProvider | typeof OWN_SANDBOX;

const CREATE_NOW = "create-now";
type TCreateTab = SnippetLanguage | typeof CREATE_NOW;

const SNIPPET_CODE_LANGUAGES: Record<SnippetLanguage, string> = {
  [SnippetLanguage.TypeScript]: "typescript",
  [SnippetLanguage.Python]: "python",
  [SnippetLanguage.Cli]: "bash"
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
      onClick={() => {
        navigator.clipboard.writeText(prompt);
        setCopied("copied");
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
          tabs={Object.values(ScriptLanguage).map((value) => ({
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

const createNowSchema = z
  .object({ label: sessionLabelSchema, ttlPreset: z.string(), customTtl: z.string() })
  .superRefine(({ ttlPreset, customTtl }, ctx) => {
    if (ttlPreset !== CUSTOM_TTL) return;
    const message = customTtlError(customTtl);
    if (message) ctx.addIssue({ code: "custom", path: ["customTtl"], message });
  });

type TCreateNowForm = z.infer<typeof createNowSchema>;

const CREATE_NOW_DEFAULTS: TCreateNowForm = { label: "", ttlPreset: "7d", customTtl: "" };

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
  onCreate: (values: { ttl: string; label?: string }) => Promise<void>;
}) => {
  const {
    control,
    handleSubmit,
    formState: { errors }
  } = form;
  const ttlPreset = useWatch({ control, name: "ttlPreset" });
  const { data: bundleDetails } = useV4Adapter("agentVaultResources").useAccessBundle(
    projectId,
    accessBundle?.id ?? ""
  );
  const needsSetup =
    accessBundle && bundleDetails?.id === accessBundle.id
      ? bundleDetails.services.filter(
          (service) => service.personalValues && !service.personalValues.isConfigured
        )
      : [];
  const shownNeedsSetup = needsSetup.length > 4 ? needsSetup.slice(0, 3) : needsSetup;
  const hiddenNeedsSetupCount = needsSetup.length - shownNeedsSetup.length;
  const [settingUp, setSettingUp] = useState<TAgentVaultService>();

  const submit = (values: TCreateNowForm) =>
    onCreate({
      ttl: values.ttlPreset === CUSTOM_TTL ? values.customTtl.trim() : values.ttlPreset,
      label: values.label || undefined
    });

  return (
    <>
      <form id={FORM_ID} onSubmit={handleSubmit(submit)}>
        <Stack gap={16}>
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
          {needsSetup.length > 0 && accessBundle && (
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
              <List label="Services that require your personal values" variant="framed" size="sm">
                {shownNeedsSetup.map((service) => (
                  <ListRow
                    key={service.id}
                    value={service.id}
                    label={service.name}
                    title={service.name}
                    media={
                      <ServiceIcon
                        hostPattern={hostPatternOf(service)}
                        serviceType={service.type}
                      />
                    }
                    actions={
                      <Button variant="outline" size="sm" onClick={() => setSettingUp(service)}>
                        Set up
                      </Button>
                    }
                  />
                ))}
                {hiddenNeedsSetupCount > 0 && (
                  <ListFooter>
                    <Button variant="link" underline="hover" asChild>
                      <Link
                        to={v4Path(
                          "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
                        )}
                        params={{ orgId, projectId, accessBundleId: accessBundle.id }}
                      >
                        {`${hiddenNeedsSetupCount} more in ${accessBundle.name}`}
                      </Link>
                    </Button>
                  </ListFooter>
                )}
              </List>
            </Stack>
          )}
        </Stack>
      </form>
      <PersonalValuesDialog
        projectId={projectId}
        service={settingUp && (needsSetup.find(({ id }) => id === settingUp.id) ?? settingUp)}
        onOpenChange={(isOpen) => !isOpen && setSettingUp(undefined)}
      />
    </>
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
  const { data: isGranted } = agentVault.useIsAccessBundleMember(
    orgId,
    projectId,
    accessBundle.id,
    { type: AgentVaultMemberType.MachineIdentity, id: identity.id, name: identity.name }
  );
  const grant = agentVault.useGrantAccessBundle(orgId, projectId);

  if (isGranted !== false || identity.role === ProjectMembershipRole.Admin) return null;

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
  const { permission } = useProjectPermission(projectId);
  const canCreateIdentity = permission.can(
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionSub.Identity
  );
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
          creation={
            canCreateIdentity
              ? {
                  mode: "dialog",
                  label: "Create machine identity",
                  title: "Add machine identity to Agent Vault",
                  submitLabel: "Create",
                  discardTitle: "Discard this machine identity?",
                  renderForm: (form) => (
                    <CreateIdentityForm
                      {...form}
                      projectId={projectId}
                      onCreated={onIdentityChange}
                    />
                  )
                }
              : undefined
          }
        />
      </Field>
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
  onChange
}: {
  orgId: string;
  projectId: string;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  disabled: boolean;
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
    <Field label="Access bundle" description="The services an agent can reach with this session.">
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
        An agent running with this session can only reach the hosts in the session&apos;s access
        bundle.
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
    <SheetTitle>
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
  const details = PLATFORMS[platform];
  return (
    <>
      <Button variant="outline" iconRight="external" asChild>
        <a href={details.guideUrl} target="_blank" rel="noopener noreferrer">
          View guide
        </a>
      </Button>
      <CopyPromptButton
        prompt={setupPrompt(details, {
          ...prompt,
          language: hasScriptLanguages(platform) ? prompt.language : undefined
        })}
      />
    </>
  );
};

const SessionFields = ({
  orgId,
  projectId,
  isAdmin,
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
  isAdmin: boolean;
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
  return (
    <Stack gap={16}>
      <AccessBundleField
        orgId={orgId}
        projectId={projectId}
        accessBundle={accessBundle}
        disabled={isLocked}
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
      {!isCreateNow && !isAdmin && (
        <Field
          label="Machine identity"
          description="Your code creates sessions as a machine identity. Ask an Agent Vault admin for the client ID and client secret of one that's granted this access bundle."
        />
      )}
      {!isCreateNow && isAdmin && (
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
  hasAccessBundle,
  prompt,
  onBack,
  onDone
}: {
  platform: TPlatform;
  isOwnSandbox: boolean;
  isCreateNow: boolean;
  created: boolean;
  isPending: boolean;
  hasAccessBundle: boolean;
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
          <Button
            variant="accent"
            type="submit"
            form={FORM_ID}
            loading={isPending}
            disabledReason={hasAccessBundle ? undefined : "Pick an access bundle first"}
          >
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
  onCreate: (values: { ttl: string; label?: string }) => Promise<void>;
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
  return {
    isOwnSandbox,
    isCreateNow: isOwnSandbox && tab === CREATE_NOW,
    language: tab === CREATE_NOW ? SnippetLanguage.Cli : tab,
    scriptLanguage:
      tab === SnippetLanguage.Python ? ScriptLanguage.Python : ScriptLanguage.TypeScript,
    platformDetails: platform && platform !== OWN_SANDBOX ? PLATFORMS[platform] : null
  };
};

export const CreateSessionSheet = ({
  orgId,
  projectId,
  isAdmin,
  open,
  onOpenChange
}: {
  orgId: string;
  projectId: string;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const agentVault = useV4Adapter("agentVault");
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
    { enabled: open, refetchOnWindowFocus: "always" }
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

  const onCreate = async (values: { ttl: string; label?: string }) => {
    if (!accessBundle) return;
    try {
      const session = await createSession.mutateAsync({
        accessBundle: accessBundle.name,
        ...values
      });
      saved("Session created");
      setCreated(session);
    } catch (error) {
      failed("Failed to create session", error);
    }
  };

  const values = (
    <SessionFields
      orgId={orgId}
      projectId={projectId}
      isAdmin={isAdmin}
      isCreateNow={isCreateNow}
      isOwnSandbox={isOwnSandbox}
      open={open}
      isLocked={isLocked}
      accessBundle={accessBundle}
      onAccessBundleChange={setAccessBundle}
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
              hasAccessBundle={Boolean(accessBundle)}
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
