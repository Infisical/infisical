import { useState } from "react";
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

import { useDebounce, useTimedReset } from "@app/hooks";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { failed, saved } from "../../access/toast";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { isNoUniversalAuthError } from "../../data/agent-vault/contract";
import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";
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
  const { user } = useV4Session();

  const [platform, setPlatform] = useState<TPlatform | null>(null);
  const [tab, setTab] = useState<TCreateTab>(readStoredTab);
  const [created, setCreated] = useState<TAgentVaultMintedSession | null>(null);
  const [accessBundle, setAccessBundle] = useState<TAgentVaultAccessBundleListItem | null>(null);
  const [identity, setIdentity] = useState<TIdentity | null>(null);
  const [bundleSearch, setBundleSearch] = useState("");
  const [identitySearch, setIdentitySearch] = useState("");
  const [label, setLabel] = useState("");
  const [ttlPreset, setTtlPreset] = useState("7d");
  const [customTtl, setCustomTtl] = useState("");
  const [errors, setErrors] = useState<{ label?: string; ttl?: string }>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPlatform(null);
      setCreated(null);
      setAccessBundle(null);
      setIdentity(null);
      setBundleSearch("");
      setIdentitySearch("");
      setLabel("");
      setTtlPreset("7d");
      setCustomTtl("");
      setErrors({});
    }
  }

  const [debouncedBundleSearch] = useDebounce(bundleSearch);
  const [debouncedIdentitySearch] = useDebounce(identitySearch);
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
  const { data: proxies } = agentVault.useProxies(
    orgId,
    projectId,
    { limit: 1 },
    { enabled: open, refetchOnWindowFocus: "always" }
  );
  const { data: identities, isPending: isSearchingIdentities } = agentVault.useMembers(
    projectId,
    {
      actorType: AgentVaultMemberType.MachineIdentity,
      search: debouncedIdentitySearch.trim() || undefined,
      limit: 50
    },
    open && isAdmin
  );
  const universalAuth = agentVault.useIdentityUniversalAuth(identity?.id ?? "");
  const { data: isGranted } = agentVault.useIsAccessBundleMember(
    orgId,
    projectId,
    accessBundle?.id ?? "",
    identity
      ? { type: AgentVaultMemberType.MachineIdentity, id: identity.id, name: identity.name }
      : null
  );
  const grant = agentVault.useGrantAccessBundle(orgId, projectId);
  const createSession = agentVault.useCreateSession(orgId, projectId);

  const hasNoProxy = proxies !== undefined && proxies.totalCount === 0;
  const hasNoUniversalAuth = Boolean(identity) && isNoUniversalAuthError(universalAuth.error);
  const hasClientIdError = Boolean(identity && universalAuth.error) && !hasNoUniversalAuth;
  const clientId =
    identity && universalAuth.data?.identityId === identity.id ? universalAuth.data.clientId : null;
  const needsGrant =
    Boolean(identity && accessBundle) &&
    isGranted === false &&
    identity?.role !== ProjectMembershipRole.Admin;

  const siteUrl = currentSiteUrl();
  const accessBundleName = accessBundle?.name ?? "<access-bundle-name>";
  const isOwnSandbox = platform === OWN_SANDBOX;
  const isCreateNow = isOwnSandbox && tab === CREATE_NOW;
  const language = tab === CREATE_NOW ? SnippetLanguage.Cli : tab;
  const scriptLanguage =
    tab === SnippetLanguage.Python ? ScriptLanguage.Python : ScriptLanguage.TypeScript;
  const isLocked = Boolean(created);
  const platformDetails = platform && platform !== OWN_SANDBOX ? PLATFORMS[platform] : null;
  const needsSetup = accessBundle?.servicesRequiringSetup ?? [];
  const shownNeedsSetup = needsSetup.length > 4 ? needsSetup.slice(0, 3) : needsSetup;

  const onTabChange = (value: string) => {
    if (!isCreateTab(value)) return;
    setTab(value);
    storeTab(value);
  };

  const onCreate = async () => {
    if (!accessBundle) return;
    const parsedLabel = sessionLabelSchema.safeParse(label);
    const ttlError = ttlPreset === CUSTOM_TTL ? customTtlError(customTtl) : undefined;
    const nextErrors = {
      label: parsedLabel.success ? undefined : parsedLabel.error.issues[0]?.message,
      ttl: ttlError
    };
    setErrors(nextErrors);
    if (nextErrors.label || nextErrors.ttl || !parsedLabel.success) return;
    try {
      const session = await createSession.mutateAsync({
        accessBundle: accessBundle.name,
        ttl: ttlPreset === CUSTOM_TTL ? customTtl.trim() : ttlPreset,
        label: parsedLabel.data || undefined
      });
      saved("Session created");
      setCreated(session);
    } catch (error) {
      failed("Failed to create session", error);
    }
  };

  const onGrant = async () => {
    if (!identity || !accessBundle) return;
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

  const identityLink = (text: string) =>
    identity && (
      <Button variant="link" asChild>
        <Link
          to={v4Path(
            "/organizations/$orgId/projects/agent-vault/$projectId/identities/$identityId"
          )}
          params={{ orgId, projectId, identityId: identity.id }}
          target="_blank"
          rel="noopener noreferrer"
        >
          {text}
        </Link>
      </Button>
    );

  let identityDescription: React.ReactNode = !isOwnSandbox
    ? "Your code creates sessions as a machine identity. Pick one to see the credentials the files below need."
    : "Your code creates sessions as a machine identity. Pick one to fill in its client ID below.";
  if (identity && hasNoUniversalAuth) identityDescription = undefined;
  else if (identity && !isOwnSandbox)
    identityDescription = (
      <>
        The files below read credentials from environment variables. Set them to {identity.name}
        &apos;s client ID and one of its {identityLink("client secrets")}.
      </>
    );
  else if (identity && hasClientIdError)
    identityDescription = (
      <>
        Couldn&apos;t load {identity.name}&apos;s client ID, so the snippets below show{" "}
        <Code>&lt;client-id&gt;</Code>. Find it on {identityLink(`${identity.name}'s page`)}.
      </>
    );
  else if (identity)
    identityDescription = (
      <>
        The snippets below have {identity.name}&apos;s client ID. Replace{" "}
        <Code>&lt;client-secret&gt;</Code> with one of its {identityLink("client secrets")}.
      </>
    );

  const bundleOptions = (bundles?.accessBundles ?? []).map((bundle) => ({
    value: bundle.id,
    label: bundle.name
  }));
  if (accessBundle && !bundleOptions.some((option) => option.value === accessBundle.id))
    bundleOptions.unshift({ value: accessBundle.id, label: accessBundle.name });

  const identityOptions = (identities?.members ?? []).map((member) => ({
    value: member.id,
    label: member.name
  }));
  if (identity && !identityOptions.some((option) => option.value === identity.id))
    identityOptions.unshift({ value: identity.id, label: identity.name });

  const values = (
    <Stack gap={16}>
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
          disabled={isLocked}
          onChange={(id) =>
            setAccessBundle(bundles?.accessBundles.find((bundle) => bundle.id === id) ?? null)
          }
        />
      </Field>
      {isCreateNow && (
        <Field label="Created as" description="Sessions you create here are attributed to you.">
          <Inline gap={8} align="center" wrap={false}>
            <Icon name="user" />
            <span>{user.name || user.email}</span>
          </Inline>
        </Field>
      )}
      {!isCreateNow && isAdmin && (
        <Field label="Machine identity" description={identityDescription}>
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
              const member = identities?.members.find((entry) => entry.id === id);
              setIdentity(member ? { id: member.id, name: member.name, role: member.role } : null);
            }}
          />
        </Field>
      )}
      {!isCreateNow && !isAdmin && (
        <Field
          label="Machine identity"
          description="Your code creates sessions as a machine identity. Ask an Agent Vault admin for the client ID and client secret of one that's granted this access bundle."
        />
      )}
      {!isCreateNow && identity && hasNoUniversalAuth && (
        <Alert tone="warn">
          {identity.name} doesn&apos;t use Universal Auth, so it has no client ID. Add Universal
          Auth on {identityLink(`${identity.name}'s page`)}.
        </Alert>
      )}
      {!isCreateNow && needsGrant && identity && accessBundle && (
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
      )}
    </Stack>
  );

  const createSnippet = createSessionSnippet(language, {
    siteUrl,
    projectId,
    accessBundle: accessBundleName,
    clientId: clientId ?? "<client-id>",
    clientSecret: "<client-secret>"
  });

  const createNowForm = (
    <form
      id={FORM_ID}
      onSubmit={(event) => {
        event.preventDefault();
        onCreate();
      }}
    >
      <Stack gap={16}>
        <Field label="Label" optional error={errors.label}>
          <Input
            value={label}
            placeholder="Nightly deploy"
            invalid={Boolean(errors.label)}
            onChange={(event) => {
              setLabel(event.target.value);
              setErrors((prev) => ({ ...prev, label: undefined }));
            }}
          />
        </Field>
        <Field
          label="Expires"
          error={errors.ttl}
          description={
            ttlPreset === NEVER_TTL ? "This session runs until someone revokes it." : undefined
          }
        >
          <Stack gap={8}>
            <Select
              label="Expires"
              value={ttlPreset}
              options={TTL_PRESETS}
              onChange={(value) => {
                setTtlPreset(value);
                setErrors((prev) => ({ ...prev, ttl: undefined }));
              }}
            />
            {ttlPreset === CUSTOM_TTL && (
              <DurationInput
                aria-label="Custom expiry"
                value={customTtl}
                invalid={Boolean(errors.ttl)}
                placeholder="90"
                onChange={(value) => {
                  setCustomTtl(value);
                  setErrors((prev) => ({ ...prev, ttl: undefined }));
                }}
              />
            )}
          </Stack>
        </Field>
        {needsSetup.length > 0 && accessBundle && (
          <Alert
            tone="warn"
            title={
              needsSetup.length === 1
                ? "1 service requires your personal values"
                : `${needsSetup.length} services require your personal values`
            }
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link
                  to={v4Path(
                    "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
                  )}
                  params={{ orgId, projectId, accessBundleId: accessBundle.id }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Set up
                </Link>
              </Button>
            }
          >
            {`Until you set ${needsSetup.length === 1 ? "it" : "them"} up, this session can't reach ${shownNeedsSetup.map((service) => service.name).join(", ")}${needsSetup.length > shownNeedsSetup.length ? ` and ${needsSetup.length - shownNeedsSetup.length} more` : ""}.`}
          </Alert>
        )}
      </Stack>
    </form>
  );

  const ownSandbox = (
    <Stack gap={16}>
      {values}
      <Tabs
        label="How to create the session"
        variant="segmented"
        value={tab}
        onValueChange={onTabChange}
        tabs={[
          { value: SnippetLanguage.TypeScript, label: "TypeScript", disabled: isLocked },
          { value: SnippetLanguage.Python, label: "Python", disabled: isLocked },
          { value: SnippetLanguage.Cli, label: "CLI", disabled: isLocked },
          { value: CREATE_NOW, label: "Create now" }
        ]}
      />
      {created && (
        <Stack gap={8}>
          <Alert tone="warn">
            This command is shown once. Copy it now, since the session token cannot be retrieved
            later.
          </Alert>
          <CodeBlock
            label="Run an agent with it"
            language="bash"
            code={runCommand(created.token, siteUrl)}
          />
          <SmallText muted>
            Run it where your agent runs. Replace <Code>&lt;proxy-host&gt;</Code> with the host your
            proxy runs on and <Code>&lt;agent-command&gt;</Code> with the agent to run, such as{" "}
            <Code>claude</Code>.{" "}
            {created.expiresAt
              ? `The session expires ${formatSessionExpiry(created.expiresAt)}.`
              : "The session lasts until someone revokes it."}
          </SmallText>
        </Stack>
      )}
      {!created && isCreateNow && createNowForm}
      {!isCreateNow && (
        <>
          <CodeBlock label="Install" language="bash" code={INSTALL_COMMANDS[language]} />
          <Stack gap={8}>
            <CodeBlock
              label="Create a session"
              language={SNIPPET_CODE_LANGUAGES[language]}
              code={createSnippet}
            />
            <SmallText muted>
              {language === SnippetLanguage.Cli ? (
                <>
                  The command stores the session token in{" "}
                  <Code>INFISICAL_AGENT_VAULT_SESSION_TOKEN</Code>, where{" "}
                  <Code>infisical agent-vault run</Code> reads it.
                </>
              ) : (
                "Revoking the session when the agent finishes stops its credentials from working, even if the agent fails."
              )}
            </SmallText>
          </Stack>
        </>
      )}
    </Stack>
  );

  const prompt =
    platformDetails && platform !== OWN_SANDBOX && platform
      ? setupPrompt(platformDetails, {
          language: hasScriptLanguages(platform) ? scriptLanguage : undefined,
          siteUrl,
          projectId,
          accessBundle: accessBundleName,
          clientId
        })
      : null;

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
          <>
            <SheetHeader>
              <SheetTitle>Create session</SheetTitle>
              <SheetDescription>
                An agent running with this session can only reach the hosts in the session&apos;s
                access bundle.
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <RadioGroup
                aria-label="Where your agent runs"
                columns={2}
                value=""
                onValueChange={(value) => setPlatform(value as TPlatform)}
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
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8} align="center" wrap={false}>
                  {platformDetails ? (
                    <ProviderIcon icon={platformDetails.logo} alt="" size="sm" />
                  ) : (
                    <Icon name="server" />
                  )}
                  {platformDetails?.name ?? "Your own sandbox"}
                </Inline>
              </SheetTitle>
              <SheetDescription>
                {platformDetails?.description ??
                  "Create sessions from your own code, wherever your agent runs, or create one here to try it out."}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <Stack gap={16}>
                {hasNoProxy && (
                  <Alert
                    tone="info"
                    actions={
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={v4Path(
                            "/organizations/$orgId/projects/agent-vault/$projectId/proxies"
                          )}
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
                )}
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
            <SheetFooter>
              <Inline gap={8} justify="end">
                {!created && (
                  <Button
                    variant="ghost"
                    disabled={createSession.isPending}
                    onClick={() => setPlatform(null)}
                  >
                    Back
                  </Button>
                )}
                <Inline gap={8} justify="end">
                  {platformDetails && prompt && (
                    <>
                      <Button variant="outline" iconRight="external" asChild>
                        <a
                          href={platformDetails.guideUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View guide
                        </a>
                      </Button>
                      <CopyPromptButton prompt={prompt} />
                    </>
                  )}
                  {isCreateNow && !created && (
                    <Button
                      variant="accent"
                      type="submit"
                      form={FORM_ID}
                      loading={createSession.isPending}
                      disabledReason={accessBundle ? undefined : "Pick an access bundle first"}
                    >
                      Create session
                    </Button>
                  )}
                  {isOwnSandbox && (!isCreateNow || created) && (
                    <Button variant="accent" onClick={() => onOpenChange(false)}>
                      Done
                    </Button>
                  )}
                </Inline>
              </Inline>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
