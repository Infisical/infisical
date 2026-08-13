import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
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
import { useGetUserProjectsByType } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  SandboxCredentialRole,
  SandboxIntegrationType,
  TSandboxCatalogIntegration,
  useAddSandboxIntegration,
  useGetSandboxCatalog
} from "@app/hooks/api/sandboxes";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

import { INTEGRATION_ICONS } from "./integrationIcons";

type Props = {
  sandboxId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_SECRET_PATH = "/";

const ProviderCard = ({
  definition,
  onSelect
}: {
  definition: TSandboxCatalogIntegration;
  onSelect: () => void;
}) => {
  const Icon = INTEGRATION_ICONS[definition.type];
  const isCustom = definition.type === SandboxIntegrationType.Custom;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-md border border-border bg-container [&>svg]:size-5">
          <Icon />
        </div>
        {definition.cli && <Badge variant="neutral">{definition.cli.name} CLI</Badge>}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{definition.name}</p>
        <p className="text-xs leading-relaxed text-muted">{definition.description}</p>
      </div>

      <p className="truncate font-mono text-[11px] text-muted">
        {isCustom ? "Any host you name" : definition.hostnames.join(", ")}
      </p>
    </button>
  );
};

export const AddIntegrationModal = ({ sandboxId, isOpen, onOpenChange }: Props) => {
  const { data: catalog } = useGetSandboxCatalog();
  const { data: projects } = useGetUserProjectsByType(ProjectType.SecretManager);
  const addIntegration = useAddSandboxIntegration();

  // Null means the picker is showing. Choosing a provider is what opens the form.
  const [type, setType] = useState<SandboxIntegrationType | null>(null);
  const [search, setSearch] = useState("");
  const [hostnames, setHostnames] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerPrefix, setHeaderPrefix] = useState("Bearer");
  const [projectId, setProjectId] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const { data: secrets } = useGetProjectSecrets({
    projectId,
    environment: DEFAULT_ENVIRONMENT,
    secretPath: DEFAULT_SECRET_PATH,
    viewSecretValue: false,
    options: { enabled: Boolean(projectId) }
  });

  // The secret list is per project, so a stale key from the previous project must not survive.
  useEffect(() => setSecretKey(""), [projectId]);

  const definition = catalog?.integrations.find((item) => item.type === type);
  const isCustom = type === SandboxIntegrationType.Custom;
  const canSubmit = Boolean(
    type && projectId && secretKey && (!isCustom || (hostnames.trim() && headerName.trim()))
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return catalog?.integrations ?? [];

    return (catalog?.integrations ?? []).filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.hostnames.some((host) => host.toLowerCase().includes(query))
    );
  }, [catalog, search]);

  const reset = () => {
    setType(null);
    setSearch("");
    setHostnames("");
    setHeaderName("Authorization");
    setHeaderPrefix("Bearer");
    setProjectId("");
    setSecretKey("");
  };

  const handleAdd = async () => {
    if (!type) return;

    await addIntegration.mutateAsync({
      sandboxId,
      type,
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
      }),
      secret: {
        projectId,
        environment: DEFAULT_ENVIRONMENT,
        secretPath: DEFAULT_SECRET_PATH,
        secretKey
      }
    });

    createNotification({ type: "success", text: `${definition?.name ?? "Integration"} added` });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{definition ? `Add ${definition.name}` : "Add Integration"}</DialogTitle>
          <DialogDescription>
            {definition
              ? "Point it at a secret. The sandbox only ever receives a placeholder."
              : "Pick a service the sandbox should be able to reach."}
          </DialogDescription>
        </DialogHeader>

        {!type ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search integrations, or the host they reach..."
              />
            </InputGroup>

            <div className="min-h-0 thin-scrollbar flex-1 overflow-y-auto pr-1">
              {filtered.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((item) => (
                    <ProviderCard
                      key={item.type}
                      definition={item}
                      onSelect={() => setType(item.type)}
                    />
                  ))}
                </div>
              ) : (
                <Empty className="border" frame="dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchIcon />
                    </EmptyMedia>
                    <EmptyTitle>No matching integrations</EmptyTitle>
                    <EmptyDescription>
                      Nothing matches &ldquo;{search}&rdquo;. Custom lets you name any host.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {isCustom ? (
              <>
                <Field>
                  <FieldLabel htmlFor="integration-hostnames">Host patterns</FieldLabel>
                  <Input
                    id="integration-hostnames"
                    value={hostnames}
                    onChange={(e) => setHostnames(e.target.value)}
                    placeholder="api.acme.com, *.acme.com:443/v1/*"
                  />
                  <FieldDescription>
                    Comma separated, <span className="font-mono">host[:port][/path]</span> with{" "}
                    <span className="font-mono">*.</span> wildcards. No scheme. Only these hosts get
                    the secret.
                  </FieldDescription>
                </Field>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <Field>
                    <FieldLabel htmlFor="integration-header">Header</FieldLabel>
                    <Input
                      id="integration-header"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="Authorization"
                    />
                  </Field>
                  <Field className="w-32">
                    <FieldLabel htmlFor="integration-prefix">Prefix</FieldLabel>
                    <Input
                      id="integration-prefix"
                      value={headerPrefix}
                      onChange={(e) => setHeaderPrefix(e.target.value)}
                      placeholder="Bearer"
                    />
                  </Field>
                </div>
                <p className="-mt-2 text-xs text-muted">
                  Sent upstream as{" "}
                  <span className="font-mono text-foreground">
                    {headerName || "Header"}: {headerPrefix ? `${headerPrefix} ` : ""}
                    &lt;secret&gt;
                  </span>
                  . Leave the prefix empty for a bare API key header.
                </p>
              </>
            ) : (
              definition && (
                <div className="grid gap-2 rounded-md border border-border bg-card p-3 text-xs text-muted sm:grid-cols-3">
                  <div>
                    <p className="text-foreground">Reaches</p>
                    <p className="mt-0.5 font-mono">{definition.hostnames.join(", ")}</p>
                  </div>
                  <div>
                    <p className="text-foreground">Sent as</p>
                    <p className="mt-0.5 font-mono">
                      {definition.headerName}:{" "}
                      {definition.headerPrefix ? `${definition.headerPrefix} ` : ""}
                      &lt;secret&gt;
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground">Placeholder</p>
                    <p className="mt-0.5 font-mono">{definition.envVarName}</p>
                  </div>
                </div>
              )
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="integration-project">Project</FieldLabel>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="integration-project" className="w-full">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="integration-secret">Secret</FieldLabel>
                <Select value={secretKey} onValueChange={setSecretKey} disabled={!projectId}>
                  <SelectTrigger id="integration-secret" className="w-full">
                    <SelectValue
                      placeholder={projectId ? "Choose a secret" : "Choose a project first"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                    {secrets?.map((secret) => (
                      <SelectItem key={secret.key} value={secret.key}>
                        {secret.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  From {DEFAULT_ENVIRONMENT} at {DEFAULT_SECRET_PATH}. Its value is never sent to
                  the sandbox.
                </FieldDescription>
              </Field>
            </div>
          </div>
        )}

        <DialogFooter className="justify-between border-t pt-4 sm:justify-between">
          {type ? (
            <Button variant="ghost" onClick={() => setType(null)}>
              <ArrowLeftIcon />
              Back
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {type && (
              <Button
                variant="project"
                onClick={handleAdd}
                isDisabled={!canSubmit}
                isPending={addIntegration.isPending}
              >
                Add Integration
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
