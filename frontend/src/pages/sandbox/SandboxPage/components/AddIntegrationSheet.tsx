import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useGetUserProjectsByType } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  SandboxCredentialRole,
  SandboxIntegrationType,
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

export const AddIntegrationSheet = ({ sandboxId, isOpen, onOpenChange }: Props) => {
  const { data: catalog } = useGetSandboxCatalog();
  const { data: projects } = useGetUserProjectsByType(ProjectType.SecretManager);
  const addIntegration = useAddSandboxIntegration();

  const [type, setType] = useState<SandboxIntegrationType>(SandboxIntegrationType.GitHub);
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
    projectId && secretKey && (!isCustom || (hostnames.trim() && headerName.trim()))
  );

  const reset = () => {
    setType(SandboxIntegrationType.GitHub);
    setHostnames("");
    setHeaderName("Authorization");
    setHeaderPrefix("Bearer");
    setProjectId("");
    setSecretKey("");
  };

  const handleAdd = async () => {
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
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Add Integration</SheetTitle>
          <SheetDescription>
            The sandbox receives a placeholder. The real secret is only added on the way out.
          </SheetDescription>
        </SheetHeader>

        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          <Field>
            <FieldLabel htmlFor="integration-type">Integration</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as SandboxIntegrationType)}>
              <SelectTrigger id="integration-type" className="w-full">
                <SelectValue placeholder="Choose an integration" />
              </SelectTrigger>
              <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                {catalog?.integrations.map((item) => {
                  const Icon = INTEGRATION_ICONS[item.type];
                  return (
                    <SelectItem key={item.type} value={item.type}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0" />
                        {item.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {definition && <FieldDescription>{definition.description}</FieldDescription>}
          </Field>

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
              <div className="rounded-md border border-border bg-card p-3 text-xs text-muted">
                <p className="text-foreground">Reaches {definition.hostnames.join(", ")}</p>
                <p className="mt-1">
                  Sent as{" "}
                  <span className="font-mono">
                    {definition.headerName}:{" "}
                    {definition.headerPrefix ? `${definition.headerPrefix} ` : ""}
                    &lt;secret&gt;
                  </span>
                </p>
                <p className="mt-1">
                  Placeholder in <span className="font-mono">{definition.envVarName}</span>
                  {definition.cli ? ` · installs the ${definition.cli.name} CLI` : ""}
                </p>
              </div>
            )
          )}

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
              From {DEFAULT_ENVIRONMENT} at {DEFAULT_SECRET_PATH}. Its value is never sent to the
              sandbox.
            </FieldDescription>
          </Field>
        </div>

        <SheetFooter className="justify-end border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            onClick={handleAdd}
            isDisabled={!canSubmit}
            isPending={addIntegration.isPending}
          >
            Add Integration
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
