import { useEffect, useState } from "react";
import { PackageIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CodeBlock,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
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
import { SandboxRunPage } from "./SandboxRunPage";
import {
  SessionMachineIdentityField,
  TSnippetIdentity,
  useSnippetClientId
} from "./SessionMachineIdentityField";
import { createSessionSnippet, INSTALL_COMMANDS, SnippetLanguage } from "./sessionSnippets";

enum SheetPage {
  CreateSession = 0,
  RunAgent = 1
}

const CREATE_NOW_TAB = "create-now";
type TCreateSessionTab = SnippetLanguage | typeof CREATE_NOW_TAB;

const TAB_STORAGE_KEY = "agentVaultCreateSessionTab";
const CREATE_NOW_FORM_ID = "agent-vault-create-session-form";

const isCreateSessionTab = (value: unknown): value is TCreateSessionTab =>
  value === CREATE_NOW_TAB || Object.values(SnippetLanguage).includes(value as SnippetLanguage);

const readStoredTab = (): TCreateSessionTab => {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return isCreateSessionTab(stored) ? stored : SnippetLanguage.TypeScript;
  } catch {
    return SnippetLanguage.TypeScript;
  }
};

const storeTab = (tab: TCreateSessionTab) => {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Storage can be blocked, e.g. in a private window; the tab just isn't remembered
  }
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CreateSessionSheet = ({ isOpen, onOpenChange }: Props) => {
  const { projectId } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [page, setPage] = useState(SheetPage.CreateSession);
  const [createdSession, setCreatedSession] = useState<TAgentVaultMintedSession | null>(null);
  const [tab, setTab] = useState<TCreateSessionTab>(readStoredTab);
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
  const { data: proxies } = useListAgentVaultProxies(projectId, { limit: 1 });
  const hasProxy = (proxies?.totalCount ?? 0) > 0;
  const { clientId } = useSnippetClientId(identity);
  const createSession = useCreateAgentVaultSession(projectId);

  // Prefilled so the snippets show a real bundle name the first time the sheet opens.
  const firstBundle = accessBundles?.accessBundles[0];
  useEffect(() => {
    if (isOpen && !accessBundle && firstBundle) setAccessBundle(firstBundle);
  }, [isOpen, accessBundle, firstBundle]);

  useEffect(() => {
    if (!isOpen) return;
    setPage(SheetPage.CreateSession);
    setCreatedSession(null);
  }, [isOpen]);

  const { protocol, hostname, port } = window.location;
  const siteUrl = `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
  const isCreateNow = tab === CREATE_NOW_TAB;
  const language = isCreateNow ? SnippetLanguage.Cli : tab;

  const onTabChange = (value: string) => {
    if (!isCreateSessionTab(value)) return;
    setTab(value);
    storeTab(value);
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
      setPage(SheetPage.RunAgent);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const snippets = (
    <div className="flex flex-col gap-4">
      {isAdmin ? (
        <SessionMachineIdentityField
          identity={identity}
          onIdentityChange={setIdentity}
          accessBundle={accessBundle}
        />
      ) : (
        <p className="text-sm text-accent">
          Your code creates sessions as a machine identity. Ask an Agent Vault admin for one
          that&apos;s granted the access bundle, with its client ID and client secret.
        </p>
      )}

      <CodeBlock label="Install" value={INSTALL_COMMANDS[language]} />

      <div className="flex flex-col gap-2">
        <CodeBlock
          label="Create a session"
          value={createSessionSnippet(language, {
            siteUrl,
            projectId,
            accessBundle: accessBundle?.name ?? "<access-bundle-name>",
            clientId: clientId ?? "<client-id>",
            clientSecret: "<client-secret>"
          })}
        />
        <p className="text-xs text-accent">
          {language === SnippetLanguage.Cli ? (
            <>
              The command stores the session token in{" "}
              <span className="font-mono">INFISICAL_AGENT_VAULT_SESSION_TOKEN</span>, where{" "}
              <span className="font-mono">infisical agent-vault run</span> reads it.
            </>
          ) : (
            "Revoking the session when the agent finishes stops its credentials from working, even if the agent fails."
          )}
        </p>
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        size="wide"
        className="flex h-full max-h-full flex-col gap-y-0"
        // The token is shown only once, so a stray click outside mustn't close the sheet.
        onInteractOutside={(event) => {
          if (createdSession) event.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>Create Session</SheetTitle>
          <SheetDescription>
            An agent running with this session can only reach the hosts in the session&apos;s
            associated access bundle.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <Stepper
              activeStep={page}
              orientation="vertical"
              nonLinear
              onStepChange={(index) => setPage(index)}
            >
              <StepperList>
                <StepperStep
                  index={SheetPage.CreateSession}
                  // Going back after Create Now could mint a second session over the unsaved token.
                  disabled={Boolean(createdSession)}
                  title="Create the session"
                  description="From your code, as a machine identity"
                />
                <StepperStep
                  index={SheetPage.RunAgent}
                  title="Run the agent"
                  description="In a sandbox, through your proxy"
                />
              </StepperList>
            </Stepper>
          </aside>

          {page === SheetPage.RunAgent ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-6">
              <SandboxRunPage
                language={language}
                accessBundle={accessBundle?.name ?? "<access-bundle-name>"}
                siteUrl={siteUrl}
                hasProxy={hasProxy}
                session={createdSession}
              />
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-6">
              <Tabs value={tab} onValueChange={onTabChange}>
                <TabsList aria-label="How to create the session">
                  <TabsTrigger value={SnippetLanguage.TypeScript}>TypeScript</TabsTrigger>
                  <TabsTrigger value={SnippetLanguage.Python}>Python</TabsTrigger>
                  <TabsTrigger value={SnippetLanguage.Cli}>CLI</TabsTrigger>
                  <TabsTrigger value={CREATE_NOW_TAB}>Create Now</TabsTrigger>
                </TabsList>
              </Tabs>

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
                  />
                  {isCreateNow && (
                    <FieldDescription>
                      The services an agent can reach with this session.
                    </FieldDescription>
                  )}
                </FieldContent>
              </Field>

              {isCreateNow ? (
                <DashboardSessionForm
                  formId={CREATE_NOW_FORM_ID}
                  accessBundle={accessBundle}
                  onSubmit={onCreateNowSubmit}
                />
              ) : (
                snippets
              )}
            </div>
          )}
        </div>

        <SheetFooter className="justify-end border-t">
          {page === SheetPage.RunAgent && (
            <>
              {!createdSession && (
                <Button
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => setPage(SheetPage.CreateSession)}
                >
                  Back
                </Button>
              )}
              <Button variant="av" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          )}
          {page === SheetPage.CreateSession && isCreateNow && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={CREATE_NOW_FORM_ID}
                variant="av"
                isDisabled={!accessBundle}
                isPending={createSession.isPending}
              >
                Create Session
              </Button>
            </>
          )}
          {page === SheetPage.CreateSession && !isCreateNow && (
            <Button variant="av" onClick={() => setPage(SheetPage.RunAgent)}>
              Next
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
