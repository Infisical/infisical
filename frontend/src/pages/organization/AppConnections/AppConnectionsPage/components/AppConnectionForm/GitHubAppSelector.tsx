import { useLayoutEffect, useRef, useState } from "react";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowUpRightFromSquare,
  faChevronLeft,
  faCircleInfo,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import slugify from "@sindresorhus/slugify";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList
} from "@app/components/v3/generic/Command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";
import { buildGitHubAppUrl } from "@app/helpers/appConnections";
import { TGitHubApp, useDeleteGitHubApp } from "@app/hooks/api/gitHubApps";

const SHARED_KEY = "__shared__";

// New GitHub Apps are pre-filled with this prefix so they're easy to identify in the GitHub account.
const GITHUB_APP_NAME_PREFIX = "infisical-";

const getAppKey = (app: TGitHubApp | null) => (app ? (app.id ?? SHARED_KEY) : null);

type Props = {
  apps: TGitHubApp[];
  isLoading: boolean;
  value: TGitHubApp | null;
  onChange: (app: TGitHubApp | null) => void;
  host?: string;
  instanceType?: "cloud" | "server";
  // Kicks off the GitHub App manifest creation flow on the parent form (redirects to GitHub).
  // Returns false when the parent form is invalid so we can return to the list view.
  onCreateApp: (params: { name: string; githubOrg: string }) => Promise<boolean> | void;
  isCreating?: boolean;
};

export const GitHubAppSelector = ({
  apps,
  isLoading,
  value,
  onChange,
  host,
  instanceType,
  onCreateApp,
  isCreating
}: Props) => {
  const [mode, setMode] = useState<"list" | "create">("list");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [newAppName, setNewAppName] = useState("");
  const [newAppOrg, setNewAppOrg] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Toggling `mode` unmounts the focused button (e.g. "Create new GitHub App"). If focus dropped to
  // <body>, the Dialog's focus trap would yank it to the first field at the top of the modal and
  // scroll up. Park focus on the always-mounted panel first so the trap never reacts.
  const switchMode = (next: "list" | "create") => {
    containerRef.current?.focus({ preventScroll: true });
    setMode(next);
  };

  // Once the create view is mounted, move focus to its first field (without scrolling).
  useLayoutEffect(() => {
    if (mode === "create") nameInputRef.current?.focus({ preventScroll: true });
  }, [mode]);

  const deleteGitHubApp = useDeleteGitHubApp();

  const sharedApp = apps.find((app) => app.id === null) ?? null;
  const customApps = apps.filter((app) => app.id !== null);

  const resetCreate = () => {
    switchMode("list");
    setNewAppName("");
    setNewAppOrg("");
  };

  const handleSelect = (app: TGitHubApp) => {
    onChange(app);
  };

  const handleDelete = async (app: TGitHubApp) => {
    if (!app.id) return;
    try {
      await deleteGitHubApp.mutateAsync(app.id);
      createNotification({ type: "success", text: `Deleted GitHub App "${app.name}"` });
      if (getAppKey(value) === app.id) onChange(null);
      setDeleteTargetId(null);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete GitHub App"
      });
    }
  };

  const handleContinueCreate = async () => {
    if (!newAppName.trim()) return;
    const didRedirect = await onCreateApp({
      // Send the same slugified name shown in the URL preview so it matches GitHub's app slug.
      name: `${GITHUB_APP_NAME_PREFIX}${slugify(newAppName, { lowercase: true })}`,
      githubOrg: newAppOrg.trim()
    });
    // When the parent form is invalid the redirect is aborted; return to the list view.
    if (didRedirect === false) {
      resetCreate();
    }
  };

  const renderCustomAppRow = (app: TGitHubApp) => {
    const isInUse = app.connectionCount > 0;

    if (deleteTargetId === app.id) {
      return (
        <div key={app.id} className="m-1 rounded-md border border-red-500/40 bg-red-500/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-mineshaft-100">
            <FontAwesomeIcon icon={faTrash} className="text-red-400" />
            <span>
              Delete <span className="font-mono">{app.name}</span>?
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-mineshaft-300">
            Removes it from Infisical and uninstalls it from GitHub. The app registration itself
            remains on GitHub until you delete it there.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="plain"
              colorSchema="secondary"
              size="xs"
              onClick={() => setDeleteTargetId(null)}
            >
              Cancel
            </Button>
            <Button
              colorSchema="danger"
              size="xs"
              isLoading={deleteGitHubApp.isPending}
              onClick={() => handleDelete(app)}
            >
              Delete
            </Button>
          </div>
        </div>
      );
    }

    return (
      <CommandItem
        key={app.id}
        value={`${app.name} ${app.owner ?? ""} ${app.slug}`}
        onSelect={() => handleSelect(app)}
        className={twMerge(
          "group",
          getAppKey(value) === app.id &&
            "bg-primary/5 ring-1 ring-primary/40 ring-inset data-[selected=true]:bg-primary/10"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-mineshaft-600 text-mineshaft-100">
          <FontAwesomeIcon icon={faGithub} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-mineshaft-100">{app.name}</p>
          <p className="truncate text-xs text-mineshaft-400">
            {app.owner ? `${app.owner} · ` : ""}
            {app.connectionCount} connection{app.connectionCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[selected=true]:opacity-100">
          <button
            type="button"
            title="Open in GitHub"
            className="rounded p-1 text-mineshaft-300 hover:bg-mineshaft-600 hover:text-mineshaft-100"
            onClick={(e) => {
              e.stopPropagation();
              window.open(
                buildGitHubAppUrl(app.slug, host, instanceType),
                "_blank",
                "noopener,noreferrer"
              );
            }}
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
          </button>
          {isInUse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Native disabled buttons don't fire pointer events, so the tooltip
                    needs a focusable wrapper to open on hover/focus. */}
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                <span tabIndex={0}>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded p-1 text-mineshaft-500"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Remove the connection{app.connectionCount === 1 ? "" : "s"} before deleting this
                app.
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              title="Delete"
              className="rounded p-1 text-mineshaft-300 hover:bg-mineshaft-600 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTargetId(app.id);
              }}
            >
              <FontAwesomeIcon icon={faTrash} className="text-xs" />
            </button>
          )}
        </div>
      </CommandItem>
    );
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 outline-none"
    >
      {mode === "create" ? (
        <div className="p-3">
          <div className="mb-3 flex items-center gap-2 border-b border-mineshaft-600 pb-2 text-sm font-medium text-mineshaft-100">
            <button
              type="button"
              className="rounded p-1 text-mineshaft-300 hover:bg-mineshaft-600 hover:text-mineshaft-100"
              onClick={resetCreate}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
            </button>
            Create GitHub App
          </div>
          <FormControl
            label="App name"
            className="mb-1"
            helperText={
              <>
                github.com/apps/
                <span className="font-mono text-mineshaft-200">
                  {GITHUB_APP_NAME_PREFIX}
                  {newAppName.trim() ? slugify(newAppName, { lowercase: true }) : "your-app"}
                </span>
              </>
            }
          >
            <Input
              ref={nameInputRef}
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              placeholder="deploy-bot"
              className="font-mono"
            />
          </FormControl>
          <FormControl label="GitHub account / org" isOptional className="mt-3 mb-0">
            <Input
              value={newAppOrg}
              onChange={(e) => setNewAppOrg(e.target.value)}
              placeholder="Leave blank for your personal account"
            />
          </FormControl>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-mineshaft-500 bg-mineshaft-700/40 px-3 py-2.5 text-xs leading-relaxed text-mineshaft-300">
            <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 text-mineshaft-400" />
            You&apos;ll be redirected to GitHub to complete the private app setup. It appears here
            as soon as you return.
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="plain" colorSchema="secondary" size="xs" onClick={resetCreate}>
              Cancel
            </Button>
            <Button
              colorSchema="secondary"
              size="xs"
              isDisabled={!newAppName.trim() || isCreating}
              isLoading={isCreating}
              leftIcon={<FontAwesomeIcon icon={faGithub} />}
              onClick={handleContinueCreate}
            >
              Continue on GitHub
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Command className="bg-transparent">
            <CommandList className="max-h-[360px]">
              {sharedApp && (
                <CommandGroup heading="SHARED">
                  <CommandItem
                    value={`instance-default ${sharedApp.name}`}
                    onSelect={() => handleSelect(sharedApp)}
                    className={twMerge(
                      "group",
                      getAppKey(value) === SHARED_KEY &&
                        "bg-primary/5 ring-1 ring-primary/40 ring-inset data-[selected=true]:bg-primary/10"
                    )}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-mineshaft-600 text-mineshaft-100">
                      <FontAwesomeIcon icon={faGithub} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-mineshaft-100">
                        {sharedApp.name}
                      </p>
                      <p className="truncate text-xs text-mineshaft-400">
                        Instance default · {sharedApp.connectionCount} connection
                        {sharedApp.connectionCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[selected=true]:opacity-100">
                      <button
                        type="button"
                        title="Open in GitHub"
                        className="rounded p-1 text-mineshaft-300 hover:bg-mineshaft-600 hover:text-mineshaft-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            buildGitHubAppUrl(sharedApp.slug, host, instanceType),
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                      >
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
                      </button>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup
                heading={
                  <span className="flex items-center gap-2">
                    CUSTOM APPS
                    {customApps.length > 0 && (
                      <span className="rounded-full bg-mineshaft-600 px-1.5 text-[10px] text-mineshaft-200">
                        {customApps.length}
                      </span>
                    )}
                  </span>
                }
              >
                {customApps.length === 0 && !isLoading ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-mineshaft-600 text-xl text-mineshaft-300">
                      <FontAwesomeIcon icon={faGithub} />
                    </div>
                    <p className="text-sm font-medium text-mineshaft-100">No custom apps yet</p>
                    <p className="max-w-[260px] text-xs leading-relaxed text-mineshaft-400">
                      Create a dedicated GitHub App for tighter, per-team permission scoping.
                    </p>
                  </div>
                ) : (
                  customApps.map((app) => renderCustomAppRow(app))
                )}
              </CommandGroup>
            </CommandList>
          </Command>
          <button
            type="button"
            onClick={() => switchMode("create")}
            className="group flex w-full items-center gap-2.5 border-t border-mineshaft-600 px-3 py-2.5 text-left hover:bg-foreground/5"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-mineshaft-500 text-mineshaft-200">
              <FontAwesomeIcon icon={faPlus} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-mineshaft-100">Create new GitHub App</p>
            </div>
          </button>
        </>
      )}
    </div>
  );
};
