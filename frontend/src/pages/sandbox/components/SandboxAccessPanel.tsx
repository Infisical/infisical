import { useEffect, useMemo, useState } from "react";
import {
  BoxesIcon,
  CheckIcon,
  CloudIcon,
  DatabaseIcon,
  KeyRoundIcon,
  MonitorIcon,
  PlugIcon,
  SearchIcon,
  TerminalIcon,
  XIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useListPamAccounts } from "@app/hooks/api/pam/queries";
import { useGetUserProjectsByType } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  SandboxCredentialRole,
  SandboxIntegrationType,
  TSandboxCatalogIntegration,
  useGetSandboxCatalog
} from "@app/hooks/api/sandboxes";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

import { INTEGRATION_ICONS } from "../SandboxPage/components/integrationIcons";

/**
 * One surface for everything a sandbox is allowed to reach. A PAM account is an integration too, so
 * the split here is only by how it is brokered: endpoints and CLIs get a credential swapped into
 * their requests, databases get a session opened for them. The wizard and the sandbox page share it
 * so granting access looks the same wherever you do it.
 */

/** A PAM account is not always a database, so the glyph follows its type rather than assuming one. */
const ACCOUNT_TYPE_ICONS: Record<string, typeof DatabaseIcon> = {
  postgres: DatabaseIcon,
  mysql: DatabaseIcon,
  mssql: DatabaseIcon,
  oracledb: DatabaseIcon,
  mongodb: DatabaseIcon,
  redis: DatabaseIcon,
  ssh: TerminalIcon,
  kubernetes: BoxesIcon,
  "aws-iam": CloudIcon,
  "gcp-service-account": CloudIcon,
  "azure-cli": CloudIcon,
  windows: MonitorIcon,
  "windows-ad": MonitorIcon
};

const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_SECRET_PATH = "/";

export type TAccessIntegration = {
  /** Server id once saved; the type stands in for it while the grant is still a draft. */
  key: string;
  type: SandboxIntegrationType;
  secretKey: string;
};

export type TAddIntegrationPayload = {
  type: SandboxIntegrationType;
  secret: { projectId: string; environment: string; secretPath: string; secretKey: string };
  hostnames?: string[];
  credential?: { role: SandboxCredentialRole; headerName: string; headerPrefix: string };
};

type Props = {
  integrations: TAccessIntegration[];
  pamAccountIds: string[];
  onAddIntegration: (payload: TAddIntegrationPayload) => void;
  onRemoveIntegration: (key: string) => void;
  onTogglePamAccount: (accountId: string) => void;
  isPending?: boolean;
};

const SectionHeading = ({
  icon: Icon,
  title,
  hint
}: {
  icon: typeof PlugIcon;
  title: string;
  hint: string;
}) => (
  <div className="flex items-baseline gap-2">
    <Icon className="size-3.5 shrink-0 translate-y-0.5 text-muted" />
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="text-xs text-muted">{hint}</p>
  </div>
);

const IntegrationRow = ({
  definition,
  isAdded,
  isExpanded,
  onToggle,
  children
}: {
  definition: TSandboxCatalogIntegration;
  isAdded: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) => {
  const Icon = INTEGRATION_ICONS[definition.type];

  return (
    <div
      className={`rounded-md border transition-colors ${
        isAdded
          ? "border-product-sandbox/40 bg-product-sandbox/[0.04]"
          : "border-border bg-card hover:border-mineshaft-500"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 p-3 text-left"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-container [&>svg]:size-4">
          <Icon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{definition.name}</p>
            {definition.cli && (
              <Badge variant="neutral" className="shrink-0">
                {definition.cli.name}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted">{definition.description}</p>
        </div>
        {isAdded ? (
          <Badge variant="success" className="shrink-0">
            <CheckIcon className="size-3" />
            Added
          </Badge>
        ) : (
          <span className="shrink-0 text-xs text-muted">{isExpanded ? "Cancel" : "Add"}</span>
        )}
      </button>
      {children}
    </div>
  );
};

export const SandboxAccessPanel = ({
  integrations,
  pamAccountIds,
  onAddIntegration,
  onRemoveIntegration,
  onTogglePamAccount,
  isPending
}: Props) => {
  const { data: catalog } = useGetSandboxCatalog();
  const { data: accounts } = useListPamAccounts();
  const { data: projects } = useGetUserProjectsByType(ProjectType.SecretManager);

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<SandboxIntegrationType | null>(null);
  const [projectId, setProjectId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [hostnames, setHostnames] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerPrefix, setHeaderPrefix] = useState("Bearer");

  const { data: secrets } = useGetProjectSecrets({
    projectId,
    environment: DEFAULT_ENVIRONMENT,
    secretPath: DEFAULT_SECRET_PATH,
    viewSecretValue: false,
    options: { enabled: Boolean(projectId) }
  });

  // The secret list is per project, so a stale key from the previous project must not survive.
  useEffect(() => setSecretKey(""), [projectId]);

  const addedTypes = useMemo(() => new Set(integrations.map((i) => i.type)), [integrations]);
  const grantedAccounts = useMemo(() => new Set(pamAccountIds), [pamAccountIds]);

  const query = search.trim().toLowerCase();

  const matchingIntegrations = (catalog?.integrations ?? []).filter(
    (item) =>
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.hostnames.some((host) => host.toLowerCase().includes(query))
  );

  const matchingAccounts = (accounts ?? []).filter(
    (account) =>
      !query ||
      account.name.toLowerCase().includes(query) ||
      (account.folderName ?? "").toLowerCase().includes(query)
  );

  const isCustom = expanded === SandboxIntegrationType.Custom;
  const canSubmit = Boolean(
    expanded && projectId && secretKey && (!isCustom || (hostnames.trim() && headerName.trim()))
  );

  const resetForm = () => {
    setExpanded(null);
    setProjectId("");
    setSecretKey("");
    setHostnames("");
    setHeaderName("Authorization");
    setHeaderPrefix("Bearer");
  };

  const submit = () => {
    if (!expanded || !canSubmit) return;

    onAddIntegration({
      type: expanded,
      secret: {
        projectId,
        environment: DEFAULT_ENVIRONMENT,
        secretPath: DEFAULT_SECRET_PATH,
        secretKey
      },
      ...(isCustom && {
        hostnames: hostnames
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean),
        credential: {
          role: SandboxCredentialRole.HeaderRewrite,
          headerName: headerName.trim(),
          headerPrefix: headerPrefix.trim()
        }
      })
    });

    resetForm();
  };

  return (
    <div className="flex flex-col gap-5">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services, hosts, and databases..."
        />
      </InputGroup>

      <div className="flex flex-col gap-2.5">
        <SectionHeading
          icon={PlugIcon}
          title="Endpoints & CLIs"
          hint="the sandbox holds a placeholder; the proxy swaps in the real secret"
        />

        {matchingIntegrations.length === 0 && (
          <p className="px-1 text-xs text-muted">No services match that search.</p>
        )}

        {matchingIntegrations.map((definition) => {
          const isAdded = addedTypes.has(definition.type);
          const isExpanded = expanded === definition.type;

          return (
            <IntegrationRow
              key={definition.type}
              definition={definition}
              isAdded={isAdded}
              isExpanded={isExpanded}
              onToggle={() => {
                if (isAdded) {
                  const match = integrations.find((i) => i.type === definition.type);
                  if (match) onRemoveIntegration(match.key);
                  return;
                }
                if (isExpanded) resetForm();
                else {
                  resetForm();
                  setExpanded(definition.type);
                }
              }}
            >
              {isExpanded && (
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`project-${definition.type}`}>Project</FieldLabel>
                      <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger id={`project-${definition.type}`} className="w-full">
                          <SelectValue placeholder="Choose a project" />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="w-(--radix-select-trigger-width)"
                        >
                          {(projects ?? []).map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`secret-${definition.type}`}>
                        {definition.envVarName}
                      </FieldLabel>
                      <Select value={secretKey} onValueChange={setSecretKey} disabled={!projectId}>
                        <SelectTrigger id={`secret-${definition.type}`} className="w-full">
                          <SelectValue
                            placeholder={projectId ? "Choose a secret" : "Pick a project first"}
                          />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="w-(--radix-select-trigger-width)"
                        >
                          {(secrets ?? []).map((secret) => (
                            <SelectItem key={secret.id} value={secret.key}>
                              {secret.key}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  {isCustom && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field className="sm:col-span-3">
                        <FieldLabel htmlFor="custom-hosts">Hostnames</FieldLabel>
                        <Input
                          id="custom-hosts"
                          value={hostnames}
                          onChange={(e) => setHostnames(e.target.value)}
                          placeholder="api.example.com, *.example.dev"
                        />
                      </Field>
                      <Field className="sm:col-span-2">
                        <FieldLabel htmlFor="custom-header">Header</FieldLabel>
                        <Input
                          id="custom-header"
                          value={headerName}
                          onChange={(e) => setHeaderName(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="custom-prefix">Prefix</FieldLabel>
                        <Input
                          id="custom-prefix"
                          value={headerPrefix}
                          onChange={(e) => setHeaderPrefix(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      variant="project"
                      size="sm"
                      onClick={submit}
                      isDisabled={!canSubmit}
                      isPending={isPending}
                    >
                      Add {definition.name}
                    </Button>
                  </div>
                </div>
              )}
            </IntegrationRow>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionHeading
          icon={KeyRoundIcon}
          title="PAM Accounts"
          hint="opened through a brokered session; no credential reaches the sandbox"
        />

        {!accounts?.length ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <DatabaseIcon />
              </EmptyMedia>
              <EmptyTitle>No PAM accounts</EmptyTitle>
              <EmptyDescription>
                Add an account in Privileged Access Manager and it will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          matchingAccounts.map((account) => {
            const isGranted = grantedAccounts.has(account.id);
            const AccountIcon = ACCOUNT_TYPE_ICONS[account.accountType] ?? KeyRoundIcon;

            return (
              <button
                key={account.id}
                type="button"
                onClick={() => onTogglePamAccount(account.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                  isGranted
                    ? "border-product-sandbox/40 bg-product-sandbox/[0.04]"
                    : "border-border bg-card hover:border-mineshaft-500"
                }`}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-container">
                  <AccountIcon className="size-4 text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
                    <Badge variant="neutral" className="shrink-0">
                      {account.accountType}
                    </Badge>
                  </div>
                  {account.folderName && (
                    <p className="truncate text-xs text-muted">{account.folderName}</p>
                  )}
                </div>
                {isGranted ? (
                  <Badge variant="success" className="shrink-0">
                    <CheckIcon className="size-3" />
                    Granted
                  </Badge>
                ) : (
                  <span className="shrink-0 text-xs text-muted">Grant</span>
                )}
              </button>
            );
          })
        )}

        {accounts?.length && matchingAccounts.length === 0 ? (
          <p className="px-1 text-xs text-muted">No accounts match that search.</p>
        ) : null}
      </div>

      {(integrations.length > 0 || pamAccountIds.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-xs text-muted">Granted:</span>
          {integrations.map((integration) => (
            <Badge key={integration.key} variant="neutral" className="gap-1">
              {integration.secretKey}
              <button
                type="button"
                aria-label={`Remove ${integration.secretKey}`}
                onClick={() => onRemoveIntegration(integration.key)}
                className="cursor-pointer text-muted hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          {pamAccountIds.length > 0 && (
            <Badge variant="neutral">
              {pamAccountIds.length} account{pamAccountIds.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};
