import { ReactNode, useMemo, useState } from "react";
import { SiPython, SiTypescript } from "react-icons/si";
import { Link } from "@tanstack/react-router";
import {
  BoxIcon,
  ExternalLinkIcon,
  PackageIcon,
  TerminalIcon,
  TriangleAlertIcon,
  UserIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  CodeBlock,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Item,
  ItemMedia,
  ItemTitle,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission, useUser } from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  useCreateAgentVaultSession,
  useListAgentVaultAccessBundles,
  useListAgentVaultProxies
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { DashboardSessionForm, TDashboardSessionInput } from "./DashboardSessionForm";
import { CodeLanguage, highlight } from "./highlightCode";
import {
  CopyPromptButton,
  PLATFORMS,
  SandboxPlatform,
  SandboxPlatformPanel,
  setupPrompt
} from "./SandboxPlatformPanel";
import { hasScriptLanguages, ScriptLanguage } from "./sandboxSnippets";
import { formatSessionExpiry } from "./SessionExpiry";
import {
  SessionMachineIdentityField,
  TSnippetIdentity,
  useSnippetClientId
} from "./SessionMachineIdentityField";
import { createSessionSnippet, INSTALL_COMMANDS, SnippetLanguage } from "./sessionSnippets";

enum DialogStep {
  Platform = "platform",
  Setup = "setup"
}

const OWN_SANDBOX = "own";
type TPlatformTab = SandboxPlatform | typeof OWN_SANDBOX;
const OWN_SANDBOX_DESCRIPTION =
  "Create sessions from your own code, wherever your agent runs, or create one here to try it out.";

const CREATE_NOW_TAB = "create-now";
type TCreateSessionTab = SnippetLanguage | typeof CREATE_NOW_TAB;

const SNIPPET_CODE_LANGUAGES: Record<SnippetLanguage, CodeLanguage> = {
  [SnippetLanguage.TypeScript]: CodeLanguage.TypeScript,
  [SnippetLanguage.Python]: CodeLanguage.Python,
  [SnippetLanguage.Cli]: CodeLanguage.Shell
};

const TAB_STORAGE_KEY = "agentVaultCreateSessionTab";
const CREATE_NOW_FORM_ID = "agent-vault-create-session-form";

const isCreateSessionTab = (value: unknown): value is TCreateSessionTab =>
  value === CREATE_NOW_TAB || Object.values(SnippetLanguage).includes(value as SnippetLanguage);

// Storage can be blocked, e.g. in a private window; the choice just isn't remembered.
const readStored = <T,>(key: string, isValid: (value: unknown) => value is T, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return isValid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // See readStored
  }
};

const runCommand = (token: string, siteUrl: string) =>
  `infisical agent-vault run \\
  --session-token ${token} \\
  --proxy <proxy-host>:17323 \\
  --domain ${siteUrl} \\
  -- <agent-command>`;

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono">{children}</span>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CreateSessionDialog = ({ isOpen, onOpenChange }: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const { user } = useUser();
  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [platform, setPlatform] = useState<TPlatformTab>(() => SandboxPlatform.Modal);
  const [tab, setTab] = useState<TCreateSessionTab>(() =>
    readStored(TAB_STORAGE_KEY, isCreateSessionTab, SnippetLanguage.TypeScript)
  );
  const [step, setStep] = useState(DialogStep.Platform);
  const [createdSession, setCreatedSession] = useState<TAgentVaultMintedSession | null>(null);
  const [accessBundle, setAccessBundle] = useState<TAgentVaultAccessBundleListItem | null>(null);
  const [identity, setIdentity] = useState<TSnippetIdentity | null>(null);

  const [bundleSearch, setBundleSearch] = useState("");
  const [debouncedBundleSearch] = useDebounce(bundleSearch);
  const { data: accessBundles, isFetching: isSearchingBundles } = useListAgentVaultAccessBundles(
    projectId,
    {
      search: debouncedBundleSearch.trim() || undefined,
      orderBy: "name",
      orderDirection: "asc",
      limit: 50
    }
  );
  const { data: proxies } = useListAgentVaultProxies(
    projectId,
    { limit: 1 },
    // The dialog stays mounted on the sessions page, so it must not poll while closed. Its notice
    // links to the proxies page in a new tab, so check again on return.
    { enabled: isOpen, refetchOnWindowFocus: "always" }
  );
  // Unknown until the list loads, so the notice doesn't flash for a project that has proxies.
  const hasNoProxy = proxies !== undefined && proxies.totalCount === 0;
  const snippet = useSnippetClientId(identity);
  const { clientId } = snippet;
  const createSession = useCreateAgentVaultSession(projectId);

  // Reset while rendering, not in an effect, so the first render after opening already shows the
  // platform picker instead of the last session's one-time token.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setStep(DialogStep.Platform);
      setCreatedSession(null);
      setAccessBundle(null);
      setIdentity(null);
      setBundleSearch("");
    }
  }

  const { protocol, hostname, port } = window.location;
  const siteUrl = `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
  const accessBundleName = accessBundle?.name ?? "<access-bundle-name>";
  const isOwnSandbox = platform === OWN_SANDBOX;
  const isCreateNow = isOwnSandbox && tab === CREATE_NOW_TAB;
  const language = tab === CREATE_NOW_TAB ? SnippetLanguage.Cli : tab;
  const scriptLanguage =
    tab === SnippetLanguage.Python ? ScriptLanguage.Python : ScriptLanguage.TypeScript;

  const onPlatformPick = (value: TPlatformTab) => {
    setPlatform(value);
    setStep(DialogStep.Setup);
  };

  const onTabChange = (value: string) => {
    if (!isCreateSessionTab(value)) return;
    setTab(value);
    store(TAB_STORAGE_KEY, value);
  };

  const onCreateNowSubmit = async ({ label, ttl }: TDashboardSessionInput) => {
    if (!accessBundle) return;
    try {
      const session = await createSession.mutateAsync({
        accessBundle: accessBundle.name,
        ttl,
        label
      });
      createNotification({ text: "Session created", type: "success" });
      setCreatedSession(session);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  // Switching away after Create Now would hide a token that can't be shown again.
  const isLocked = Boolean(createdSession);

  const platformOptions: { value: TPlatformTab; name: string; icon: ReactNode }[] = [
    ...Object.values(SandboxPlatform).map((value) => ({
      value,
      name: PLATFORMS[value].name,
      icon: <img src={PLATFORMS[value].logo} alt="" className="size-8 rounded-sm object-contain" />
    })),
    {
      value: OWN_SANDBOX,
      name: "Your Own Sandbox",
      icon: <BoxIcon className="size-7 text-accent" aria-hidden />
    }
  ];

  const bundleField = (
    <Field>
      <FieldLabel htmlFor="agent-vault-session-bundle">Access Bundle</FieldLabel>
      <FieldContent>
        <Combobox
          id="agent-vault-session-bundle"
          options={accessBundles?.accessBundles ?? []}
          value={accessBundle}
          shouldFilter={false}
          isLoading={isSearchingBundles}
          includeMissingSelectedOptions
          onInputValueChange={setBundleSearch}
          getOptionValue={(bundle) => bundle.id}
          getOptionLabel={(bundle) => bundle.name}
          placeholder="Pick an access bundle"
          searchPlaceholder="Search access bundles..."
          emptyMessage="No access bundle matches."
          modal
          renderOption={(bundle) => (
            <span className="flex min-w-0 items-center gap-2">
              <PackageIcon className="size-4 shrink-0 text-muted" />
              <span className="truncate">{bundle.name}</span>
            </span>
          )}
          renderValue={(bundle) => (
            <span className="flex min-w-0 items-center gap-2">
              <PackageIcon className="size-4 shrink-0 text-muted" />
              <span className="truncate">{bundle.name}</span>
            </span>
          )}
          onValueChange={setAccessBundle}
          onClear={() => setAccessBundle(null)}
          // The created session keeps the bundle it was made with.
          isDisabled={isLocked}
        />
        <FieldDescription>The services an agent can reach with this session.</FieldDescription>
      </FieldContent>
    </Field>
  );

  const values = (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      {bundleField}
      {isCreateNow && (
        // Shaped like the identity field it replaces, so the tabs below don't move.
        <Field>
          <FieldLabel>Created As</FieldLabel>
          <FieldContent>
            {/* As tall as the picker beside it, so the two columns line up. */}
            <span className="flex h-9 min-w-0 items-center gap-2 text-sm">
              <UserIcon className="size-4 shrink-0 text-muted" />
              <span className="truncate">{userName}</span>
            </span>
            <FieldDescription className="min-h-8">
              Sessions you create here are attributed to you.
            </FieldDescription>
          </FieldContent>
        </Field>
      )}
      {!isCreateNow && isAdmin && (
        <SessionMachineIdentityField
          identity={identity}
          onIdentityChange={setIdentity}
          accessBundle={accessBundle}
          snippet={snippet}
        />
      )}
      {!isCreateNow && !isAdmin && (
        // Labeled like the picker admins see here, so it lines up with the bundle field beside it.
        <Field>
          <FieldLabel>Machine Identity</FieldLabel>
          <FieldContent>
            <FieldDescription>
              Your code creates sessions as a machine identity. Ask an Agent Vault admin for the
              client ID and client secret of one that&apos;s granted this access bundle.
            </FieldDescription>
          </FieldContent>
        </Field>
      )}
    </div>
  );

  const createSnippet = createSessionSnippet(language, {
    siteUrl,
    projectId,
    accessBundle: accessBundleName,
    clientId: clientId ?? "<client-id>",
    clientSecret: "<client-secret>"
  });
  const highlightedInstall = useMemo(
    () => highlight(INSTALL_COMMANDS[language], CodeLanguage.Shell),
    [language]
  );
  const highlightedCreateSnippet = useMemo(
    () => highlight(createSnippet, SNIPPET_CODE_LANGUAGES[language]),
    [createSnippet, language]
  );

  const ownSandbox = (
    <div className="flex flex-col gap-4">
      {values}

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList aria-label="How to create the session">
          <TabsTrigger value={SnippetLanguage.TypeScript} disabled={isLocked}>
            <SiTypescript />
            TypeScript
          </TabsTrigger>
          <TabsTrigger value={SnippetLanguage.Python} disabled={isLocked}>
            <SiPython />
            Python
          </TabsTrigger>
          <TabsTrigger value={SnippetLanguage.Cli} disabled={isLocked}>
            <TerminalIcon />
            CLI
          </TabsTrigger>
          <TabsTrigger value={CREATE_NOW_TAB}>Create Now</TabsTrigger>
        </TabsList>
      </Tabs>

      {createdSession && (
        <div className="flex flex-col gap-4">
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              This command is shown once. Copy it now, since the session token cannot be retrieved
              later.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <CodeBlock
              label="Run an agent with it"
              value={runCommand(createdSession.token, siteUrl)}
            />
            <p className="text-xs text-accent">
              Run it where your agent runs. Replace <Mono>&lt;proxy-host&gt;</Mono> with the host
              your proxy runs on and <Mono>&lt;agent-command&gt;</Mono> with the agent to run, such
              as <Mono>claude</Mono>.{" "}
              {createdSession.expiresAt
                ? `The session expires ${formatSessionExpiry(createdSession.expiresAt)}.`
                : "The session lasts until someone revokes it."}
            </p>
          </div>
        </div>
      )}

      {!createdSession && isCreateNow && (
        <DashboardSessionForm
          formId={CREATE_NOW_FORM_ID}
          accessBundle={accessBundle}
          onSubmit={onCreateNowSubmit}
        />
      )}

      {!isCreateNow && (
        <>
          <CodeBlock label="Install" value={INSTALL_COMMANDS[language]}>
            {highlightedInstall}
          </CodeBlock>
          <div className="flex flex-col gap-2">
            <CodeBlock label="Create a session" value={createSnippet}>
              {highlightedCreateSnippet}
            </CodeBlock>
            <p className="text-xs text-accent">
              {language === SnippetLanguage.Cli ? (
                <>
                  The command stores the session token in{" "}
                  <Mono>INFISICAL_AGENT_VAULT_SESSION_TOKEN</Mono>, where{" "}
                  <Mono>infisical agent-vault run</Mono> reads it.
                </>
              ) : (
                "Revoking the session when the agent finishes stops its credentials from working, even if the agent fails."
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );

  const platformDetails = platform === OWN_SANDBOX ? null : PLATFORMS[platform];
  const prompt =
    platform === OWN_SANDBOX
      ? null
      : setupPrompt(PLATFORMS[platform], {
          language: hasScriptLanguages(platform) ? scriptLanguage : undefined,
          siteUrl,
          projectId,
          accessBundle: accessBundleName,
          clientId
        });

  return (
    <>
      <Dialog open={isOpen && step === DialogStep.Platform} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Session</DialogTitle>
            <DialogDescription>
              An agent running with this session can only reach the hosts in the session&apos;s
              associated access bundle.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {platformOptions.map((option) => (
              <Item key={option.value} variant="outline" asChild>
                <button
                  type="button"
                  // Item only styles hover for links, so a button adds its own.
                  className="cursor-pointer hover:border-product-av/30 hover:bg-product-av/5"
                  onClick={() => onPlatformPick(option.value)}
                >
                  <ItemMedia className="size-8">{option.icon}</ItemMedia>
                  <ItemTitle>{option.name}</ItemTitle>
                </button>
              </Item>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpen && step === DialogStep.Setup} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-3xl"
          height="fixed"
          isPending={createSession.isPending}
          // The token is shown only once, so a stray click outside mustn't close the dialog.
          onInteractOutside={(event) => {
            if (createdSession) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {platformDetails ? (
                <img
                  src={platformDetails.logo}
                  alt=""
                  className="size-5 shrink-0 rounded-sm object-contain"
                />
              ) : (
                <BoxIcon className="size-5 shrink-0" aria-hidden />
              )}
              {platformDetails?.name ?? "Your Own Sandbox"}
            </DialogTitle>
            <DialogDescription>
              {platformDetails?.description ?? OWN_SANDBOX_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            {hasNoProxy && (
              <p className="text-xs text-accent">
                Agents reach their services through a proxy, and this project has none yet.{" "}
                <Link
                  to="/organizations/$orgId/projects/agent-vault/$projectId/proxies"
                  params={{ orgId: currentOrg.id, projectId }}
                  // A new tab, so the dialog keeps its picks while the user sets up a proxy.
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Create a proxy
                </Link>{" "}
                first.
              </p>
            )}

            {isOwnSandbox ? (
              ownSandbox
            ) : (
              <SandboxPlatformPanel
                key={platform}
                platform={platform}
                language={scriptLanguage}
                onLanguageChange={onTabChange}
                siteUrl={siteUrl}
                projectId={projectId}
                accessBundle={accessBundleName}
                values={values}
              />
            )}
          </DialogBody>

          <DialogFooter>
            {!createdSession && (
              <Button
                variant="ghost"
                className="mr-auto"
                isDisabled={createSession.isPending}
                onClick={() => setStep(DialogStep.Platform)}
              >
                Back
              </Button>
            )}
            {platformDetails && prompt && (
              <>
                <Button variant="outline" asChild>
                  <a href={platformDetails.guideUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon />
                    View Guide
                  </a>
                </Button>
                <CopyPromptButton prompt={prompt} />
              </>
            )}
            {isCreateNow && !createdSession && (
              <Button
                type="submit"
                form={CREATE_NOW_FORM_ID}
                variant="av"
                isDisabled={!accessBundle}
                isPending={createSession.isPending}
              >
                Create Session
              </Button>
            )}
            {isOwnSandbox && (!isCreateNow || createdSession) && (
              <Button variant="av" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
