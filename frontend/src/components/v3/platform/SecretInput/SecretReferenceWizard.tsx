import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, ChevronRightIcon, FolderIcon, KeyRoundIcon, LayersIcon } from "lucide-react";

import { useProject } from "@app/context";
import { useGetProjectFolders, useGetProjectSecrets, useGetWorkspaceById } from "@app/hooks/api";
import { useListProjectGrantsReceived } from "@app/hooks/api/projectGrants";
import { TProjectGrantReceived } from "@app/hooks/api/projectGrants/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../generic/Tabs";
import { cn } from "../../utils";

type WizardTab = "this-project" | "another-project";

type WizardState = {
  tab: WizardTab;
  step: "project" | "env" | "browse";
  selectedProjectGrant: TProjectGrantReceived | null;
  env: { slug: string; name: string } | null;
  secretPath: string;
};

type Props = {
  onSelect: (referenceContent: string) => void;
  isEnabled: boolean;
  onFocusItem: () => void;
  currentInput?: string;
};

const INITIAL_STATE: WizardState = {
  tab: "this-project",
  step: "env",
  selectedProjectGrant: null,
  env: null,
  secretPath: "/"
};

export const SecretReferenceWizard = ({ onSelect, isEnabled, onFocusItem, currentInput = "" }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const { data: receivedGrants } = useListProjectGrantsReceived(projectId);

  const { data: selectedSourceProject } = useGetWorkspaceById(
    state.selectedProjectGrant?.sourceProjectId || ""
  );

  const browseProjectId =
    state.step === "browse" && state.selectedProjectGrant
      ? state.selectedProjectGrant.sourceProjectId
      : projectId;

  const { data: secrets } = useGetProjectSecrets({
    projectId: browseProjectId,
    environment: state.env?.slug || "",
    secretPath: state.secretPath,
    viewSecretValue: false,
    options: {
      enabled:
        isEnabled &&
        state.step === "browse" &&
        Boolean(browseProjectId) &&
        Boolean(state.env?.slug)
    }
  });

  const { data: folders } = useGetProjectFolders({
    projectId: browseProjectId,
    environment: state.env?.slug || "",
    path: state.secretPath,
    options: {
      enabled:
        isEnabled &&
        state.step === "browse" &&
        Boolean(browseProjectId) &&
        Boolean(state.env?.slug)
    }
  });

  const uniqueSourceProjects = useMemo(() => {
    if (!receivedGrants) return [];
    const seen = new Set<string>();
    return receivedGrants.filter((g) => {
      if (seen.has(g.sourceProjectId)) return false;
      seen.add(g.sourceProjectId);
      return true;
    });
  }, [receivedGrants]);

  const parsedInput = useMemo(() => {
    if (!currentInput.startsWith("@")) return null;
    const segments = currentInput.slice(1).split(".");
    const projectSlug = segments[0] || "";
    const hasProjectDot = currentInput.indexOf(".") !== -1;
    const envSlug = segments[1] || "";
    const hasEnvDot = segments.length > 2;
    const folderSegments = hasEnvDot ? segments.slice(2, -1) : [];
    const lastSegment = hasEnvDot ? segments[segments.length - 1] : "";

    return { projectSlug, hasProjectDot, envSlug, hasEnvDot, folderSegments, lastSegment };
  }, [currentInput]);

  useEffect(() => {
    if (!parsedInput) return;

    const { projectSlug, hasProjectDot, envSlug, hasEnvDot, folderSegments } = parsedInput;

    if (!hasProjectDot) {
      setState({
        ...INITIAL_STATE,
        tab: "another-project",
        step: "project"
      });
      return;
    }

    const matchedGrant = uniqueSourceProjects.find(
      (g) => g.sourceProjectSlug.toLowerCase() === projectSlug.toLowerCase()
    );
    if (!matchedGrant) {
      setState({
        ...INITIAL_STATE,
        tab: "another-project",
        step: "project"
      });
      return;
    }

    if (!hasEnvDot) {
      setState({
        tab: "another-project",
        step: "env",
        selectedProjectGrant: matchedGrant,
        env: null,
        secretPath: "/"
      });
      return;
    }

    const envGrants =
      receivedGrants?.filter((g) => g.sourceProjectId === matchedGrant.sourceProjectId) || [];
    const matchedEnv = envGrants.find(
      (g) => g.environmentSlug.toLowerCase() === envSlug.toLowerCase()
    );

    if (!matchedEnv) {
      setState({
        tab: "another-project",
        step: "env",
        selectedProjectGrant: matchedGrant,
        env: null,
        secretPath: "/"
      });
      return;
    }

    const secretPath =
      folderSegments.length > 0 ? `/${folderSegments.join("/")}/` : "/";

    setState({
      tab: "another-project",
      step: "browse",
      selectedProjectGrant: matchedGrant,
      env: { slug: matchedEnv.environmentSlug, name: matchedEnv.environmentName },
      secretPath
    });
  }, [parsedInput, uniqueSourceProjects, receivedGrants]);

  const projectFilter = parsedInput && !parsedInput.hasProjectDot ? parsedInput.projectSlug.toLowerCase() : "";
  const envFilter = parsedInput?.hasProjectDot && !parsedInput.hasEnvDot ? parsedInput.envSlug.toLowerCase() : "";
  const browseFilter = parsedInput?.hasEnvDot ? parsedInput.lastSegment.toLowerCase() : "";

  const availableEnvs = useMemo(() => {
    if (state.tab === "this-project") {
      return (currentProject?.environments || []).map((e) => ({ name: e.name, slug: e.slug }));
    }
    if (!state.selectedProjectGrant) return [];
    const projectGrants =
      receivedGrants?.filter(
        (g) => g.sourceProjectId === state.selectedProjectGrant!.sourceProjectId
      ) || [];
    const seen = new Set<string>();
    return projectGrants
      .filter((g) => {
        if (seen.has(g.environmentSlug)) return false;
        seen.add(g.environmentSlug);
        return true;
      })
      .map((g) => ({ name: g.environmentName, slug: g.environmentSlug }));
  }, [state.tab, state.selectedProjectGrant, currentProject, receivedGrants]);

  const breadcrumbs = useMemo(() => {
    if (state.step !== "browse" || !state.env) return [];
    const pathParts = state.secretPath.split("/").filter(Boolean);
    return [state.env.name, ...pathParts];
  }, [state]);

  const handleTabChange = (tab: string) => {
    const newTab = tab as WizardTab;
    setState({
      ...INITIAL_STATE,
      tab: newTab,
      step: newTab === "another-project" ? "project" : "env"
    });
  };

  const handleSelectProject = (grant: TProjectGrantReceived) => {
    setState((prev) => ({ ...prev, step: "env", selectedProjectGrant: grant }));
  };

  const handleSelectEnv = (envSlug: string, envName: string) => {
    setState((prev) => ({
      ...prev,
      step: "browse",
      env: { slug: envSlug, name: envName },
      secretPath: "/"
    }));
  };

  const handleSelectFolder = (folderName: string) => {
    setState((prev) => {
      const currentPath = prev.secretPath;
      const newPath =
        currentPath === "/" ? `/${folderName}/` : `${currentPath}${folderName}/`;
      return { ...prev, secretPath: newPath };
    });
  };

  const handleSelectSecret = (secretKey: string) => {
    if (!state.env) return;
    const pathParts = state.secretPath.split("/").filter(Boolean);
    const segments = [state.env.slug, ...pathParts, secretKey];

    let reference: string;
    if (state.selectedProjectGrant && selectedSourceProject?.slug) {
      reference = `@${selectedSourceProject.slug}.${segments.join(".")}`;
    } else {
      reference = segments.join(".");
    }

    onSelect(reference);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setState((prev) => ({
        ...prev,
        step: "env",
        env: null,
        secretPath: "/"
      }));
      return;
    }
    const pathParts = state.secretPath.split("/").filter(Boolean);
    const newPath = "/" + pathParts.slice(0, index).join("/") + (index > 0 ? "/" : "");
    setState((prev) => ({ ...prev, secretPath: newPath }));
  };

  const renderProjectStep = () => {
    const filteredProjects = projectFilter
      ? uniqueSourceProjects.filter((g) =>
          g.sourceProjectSlug.toLowerCase().includes(projectFilter)
        )
      : uniqueSourceProjects;

    return (
    <div className="flex flex-col">
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-sm text-muted">
          {projectFilter ? "No matching projects" : "No projects have shared secrets with you"}
        </div>
      ) : (
        <>
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Projects that shared with you
          </div>
          {filteredProjects.map((grant) => (
            <button
              key={grant.sourceProjectId}
              type="button"
              aria-label="suggestion-item"
              onClick={() => {
                onFocusItem();
                handleSelectProject(grant);
              }}
              className="flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-project/20 text-xs font-semibold text-project">
                  {grant.sourceProjectName[0]?.toUpperCase()}
                </div>
                <span className="truncate">{grant.sourceProjectName}</span>
              </div>
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
            </button>
          ))}
        </>
      )}
    </div>
  );
  };

  const renderEnvStep = () => {
    const filteredEnvs = envFilter
      ? availableEnvs.filter((e) => e.slug.toLowerCase().includes(envFilter))
      : availableEnvs;

    return (
    <div className="flex flex-col">
      {state.selectedProjectGrant && (
        <button
          type="button"
          aria-label="suggestion-item"
          onClick={() => {
            onFocusItem();
            setState((prev) => ({ ...prev, step: "project", env: null }));
          }}
          className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3 shrink-0" />
          <span className="truncate">{state.selectedProjectGrant.sourceProjectName}</span>
        </button>
      )}
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        Environments
      </div>
      {filteredEnvs.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-sm text-muted">
          {envFilter ? "No matching environments" : "No environments available"}
        </div>
      ) : (
        filteredEnvs.map((env) => (
          <button
            key={env.slug}
            type="button"
            aria-label="suggestion-item"
            onClick={() => {
              onFocusItem();
              handleSelectEnv(env.slug, env.name);
            }}
            className="flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
          >
            <div className="flex items-center gap-2">
              <LayersIcon className="size-4 text-success" />
              <span>{env.name}</span>
            </div>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
          </button>
        ))
      )}
    </div>
  );
  };

  const renderBrowseStep = () => {
    const folderList = browseFilter
      ? (folders || []).filter((f) => f.name.toLowerCase().includes(browseFilter))
      : folders || [];
    const secretList = browseFilter
      ? (secrets || []).filter((s) => s.key.toLowerCase().includes(browseFilter))
      : secrets || [];
    const isEmpty = folderList.length === 0 && secretList.length === 0;

    return (
      <div className="flex flex-col">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5 text-xs text-muted no-scrollbar">
          <button
            type="button"
            aria-label="suggestion-item"
            onClick={() => {
              onFocusItem();
              handleBreadcrumbClick(-1);
            }}
            className="shrink-0 transition-colors hover:text-foreground"
          >
            Envs
          </button>
          {breadcrumbs.map((crumb, i) => (
            <span key={`crumb-${i + 1}`} className="flex shrink-0 items-center gap-0.5">
              <ChevronRightIcon className="size-3" />
              <button
                type="button"
                aria-label="suggestion-item"
                onClick={() => {
                  onFocusItem();
                  handleBreadcrumbClick(i);
                }}
                className={cn(
                  "transition-colors hover:text-foreground",
                  i === breadcrumbs.length - 1 && "font-medium text-foreground"
                )}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>

        {isEmpty && (
          <div className="flex items-center justify-center py-6 text-sm text-muted">
            No secrets found
          </div>
        )}

        {folderList.map((folder) => (
          <button
            key={folder.id}
            type="button"
            aria-label="suggestion-item"
            onClick={() => {
              onFocusItem();
              handleSelectFolder(folder.name);
            }}
            className="flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
          >
            <div className="flex items-center gap-2">
              <FolderIcon className="size-4 text-warning" />
              <span>{folder.name}</span>
            </div>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
          </button>
        ))}

        {folderList.length > 0 && secretList.length > 0 && (
          <div className="my-1 border-t border-border" />
        )}

        {secretList.length > 0 && (
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Secrets in this {state.tab === "another-project" ? "project" : "environment"}
          </div>
        )}

        {secretList.map((secret) => (
          <button
            key={secret.id}
            type="button"
            aria-label="suggestion-item"
            onClick={() => {
              onFocusItem();
              handleSelectSecret(secret.key);
            }}
            className="group flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
          >
            <div className="flex items-center gap-2">
              <KeyRoundIcon className="size-4 text-muted" />
              <span>{secret.key}</span>
            </div>
            <span className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
              insert
            </span>
          </button>
        ))}
      </div>
    );
  };

  const renderStepContent = () => {
    switch (state.step) {
      case "project":
        return renderProjectStep();
      case "env":
        return renderEnvStep();
      case "browse":
        return renderBrowseStep();
      default:
        return null;
    }
  };

  return (
    <Tabs value={state.tab} onValueChange={handleTabChange} className="gap-0">
      <TabsList
        className="h-auto w-full rounded-none rounded-t-md border-0 border-b border-border bg-transparent p-0"
      >
        <TabsTrigger
          value="this-project"
          className="flex-1 rounded-none rounded-tl-md border-0 py-2 text-xs"
        >
          This project
        </TabsTrigger>
        <TabsTrigger
          value="another-project"
          className="flex-1 rounded-none rounded-tr-md border-0 py-2 text-xs"
        >
          Another project @
        </TabsTrigger>
      </TabsList>
      <TabsContent value="this-project" className="mt-0">
        {state.tab === "this-project" && renderStepContent()}
      </TabsContent>
      <TabsContent value="another-project" className="mt-0">
        {state.tab === "another-project" && renderStepContent()}
      </TabsContent>
    </Tabs>
  );
};
