import { useLayoutEffect, useRef, useState } from "react";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowUpRightFromSquare,
  faChevronLeft,
  faCircleInfo,
  faGear,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import slugify from "@sindresorhus/slugify";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList
} from "@app/components/v3/generic/Command";
import { IconButton } from "@app/components/v3/generic/IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";
import { InstanceIcon, OrgIcon, ProjectIcon } from "@app/components/v3/platform/ScopeIcons";
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
  // When set, the selector is in project scope: org apps are listed (and selectable) but managed
  // from the organization's App Connections page, and newly created apps are project-scoped.
  projectId?: string | null;
};

export const GitHubAppSelector = ({
  apps,
  isLoading,
  value,
  onChange,
  host,
  instanceType,
  onCreateApp,
  isCreating,
  projectId
}: Props) => {
  // The compact picker only selects an app; creation and deletion live in the management modal
  // behind the gear button.
  const [isManageOpen, setIsManageOpen] = useState(false);
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
  // In project scope the private list mixes both scopes: the project's own apps plus the org's
  // (projects have visibility over their org, not the other way around). Each row's scope icon
  // tells them apart.
  const customApps = apps.filter((app) => app.id !== null);

  const resetCreate = () => {
    switchMode("list");
    setNewAppName("");
    setNewAppOrg("");
  };

  const handleManageOpenChange = (open: boolean) => {
    setIsManageOpen(open);
    if (!open) {
      setMode("list");
      setDeleteTargetId(null);
      setNewAppName("");
      setNewAppOrg("");
    }
  };

  // Selecting an app from the management modal also uses it for the connection.
  const handleSelect = (app: TGitHubApp) => {
    onChange(app);
    handleManageOpenChange(false);
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

  // Non-interactive group label rendered between dropdown items.
  const renderPickerHeading = (label: string) => (
    <div className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-mineshaft-400">
      {label}
    </div>
  );

  const renderPickerItem = (app: TGitHubApp) => (
    <SelectItem key={getAppKey(app)} value={getAppKey(app) as string}>
      {app.name}
    </SelectItem>
  );

  const renderCustomAppRow = (app: TGitHubApp, canDelete: boolean) => {
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-mineshaft-600">
          {app.projectId ? (
            <ProjectIcon className="size-4 text-project" />
          ) : (
            <OrgIcon className="size-4 text-org" />
          )}
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
          {isInUse || !canDelete ? (
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
                {canDelete ? (
                  <>
                    Remove the connection{app.connectionCount === 1 ? "" : "s"} before deleting this
                    app.
                  </>
                ) : (
                  "Organization apps can only be deleted from the organization's App Connections page."
                )}
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
    <>
      <div className="flex items-center gap-2">
        <Select
          value={getAppKey(value) ?? ""}
          onValueChange={(key) => {
            const app = apps.find((a) => getAppKey(a) === key);
            if (app) onChange(app);
          }}
          isLoading={isLoading}
          isDisabled={isLoading}
          placeholder="Select a GitHub App"
          containerClassName="min-w-0 flex-1"
          className="w-full border border-mineshaft-500"
          dropdownContainerClassName="max-w-none"
          position="popper"
        >
          {sharedApp && (
            <>
              {renderPickerHeading("SHARED")}
              {renderPickerItem(sharedApp)}
            </>
          )}
          {customApps.length > 0 && (
            <>
              {renderPickerHeading("PRIVATE")}
              {customApps.map(renderPickerItem)}
            </>
          )}
          {!sharedApp && customApps.length === 0 && !isLoading && (
            <div className="px-4 py-6 text-center text-xs leading-relaxed text-mineshaft-400">
              No GitHub Apps available yet. Use the gear button to create one.
            </div>
          )}
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="outline"
              aria-label="Manage GitHub Apps"
              onClick={() => setIsManageOpen(true)}
              className="h-[38px] w-[38px] shrink-0 border-mineshaft-500 bg-mineshaft-900 text-mineshaft-200 hover:bg-mineshaft-700"
            >
              <FontAwesomeIcon icon={faGear} />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Manage GitHub Apps</TooltipContent>
        </Tooltip>
      </div>

      <Modal isOpen={isManageOpen} onOpenChange={handleManageOpenChange}>
        <ModalContent
          title="Manage GitHub Apps"
          subTitle="Create, inspect, and remove the GitHub Apps available to your connections. Selecting an app uses it for this connection."
        >
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
                <FormControl
                  label="Organization"
                  className="mt-3 mb-0"
                  tooltipText="Enter a GitHub organization name to create the app under that organization. This is required if you want to install the app on repositories owned by the organization. Leave blank to create the app under your personal account."
                >
                  <Input
                    value={newAppOrg}
                    onChange={(e) => setNewAppOrg(e.target.value)}
                    placeholder="Leave blank to create on your personal account"
                  />
                </FormControl>
                <div className="mt-3 flex items-start gap-2 rounded-md border border-mineshaft-500 bg-mineshaft-700/40 px-3 py-2.5 text-xs leading-relaxed text-mineshaft-300">
                  <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 text-mineshaft-400" />
                  You&apos;ll be redirected to GitHub to complete the private app setup. It appears
                  here as soon as you return.
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
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-mineshaft-600">
                            <InstanceIcon className="size-4 text-mineshaft-200" />
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
                              <FontAwesomeIcon
                                icon={faArrowUpRightFromSquare}
                                className="text-xs"
                              />
                            </button>
                          </div>
                        </CommandItem>
                      </CommandGroup>
                    )}
                    <CommandGroup
                      heading={
                        <span className="flex items-center gap-2">
                          PRIVATE
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
                          <p className="text-sm font-medium text-mineshaft-100">
                            No private apps yet
                          </p>
                          <p className="max-w-[260px] text-xs leading-relaxed text-mineshaft-400">
                            Create a dedicated GitHub App for tighter, per-team permission scoping.
                          </p>
                        </div>
                      ) : (
                        customApps.map((app) =>
                          renderCustomAppRow(app, !projectId || app.projectId !== null)
                        )
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
        </ModalContent>
      </Modal>
    </>
  );
};
