import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  KeyRoundIcon,
  LayersIcon,
  SearchIcon
} from "lucide-react";

import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetProjectFolders, useGetProjectSecrets } from "@app/hooks/api";

export type TSecretSelection = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

type Props = {
  value?: TSecretSelection;
  onChange: (selection: TSecretSelection) => void;
  isError?: boolean;
};

const joinPath = (base: string, folder: string) =>
  base === "/" ? `/${folder}` : `${base}/${folder}`;

const parentPath = (path: string) => {
  if (path === "/") return "/";
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join("/")}` : "/";
};

// Browses the project the same way the secret reference wizard does: pick an environment, walk the
// folders, then pick a secret. It returns the three fields a policy credential stores rather than a
// reference string, which is the only reason it isn't that component.
export const SecretPickerPopover = ({ value, onChange, isError }: Props) => {
  const { currentProject, projectId } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [environment, setEnvironment] = useState<string | null>(value?.environment ?? null);
  const [secretPath, setSecretPath] = useState(value?.secretPath ?? "/");
  const [search, setSearch] = useState("");

  // Reopening on an already-filled credential should land where that secret lives, not at the top.
  useEffect(() => {
    if (!isOpen) return;
    setEnvironment(value?.environment ?? null);
    setSecretPath(value?.secretPath ?? "/");
    setSearch("");
  }, [isOpen]);

  const isBrowsing = Boolean(environment);

  const { data: folders } = useGetProjectFolders({
    projectId,
    environment: environment ?? "",
    path: secretPath,
    options: { enabled: isOpen && isBrowsing }
  });

  const { data: secrets } = useGetProjectSecrets({
    projectId,
    environment: environment ?? "",
    secretPath,
    viewSecretValue: false,
    options: { enabled: isOpen && isBrowsing }
  });

  const query = search.trim().toLowerCase();
  const visibleFolders = (folders ?? []).filter((folder) =>
    folder.name.toLowerCase().includes(query)
  );
  const visibleSecrets = (secrets ?? []).filter((secret) =>
    secret.key.toLowerCase().includes(query)
  );

  const label = value?.secretKey
    ? `${value.environment}${value.secretPath === "/" ? "" : value.secretPath}/${value.secretKey}`
    : "Select secret...";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-start font-normal ${isError ? "border-danger" : ""} ${
            value?.secretKey ? "" : "text-muted"
          }`}
        >
          <KeyRoundIcon className="mr-1 size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {!isBrowsing ? (
          <div className="max-h-72 thin-scrollbar overflow-y-auto py-1">
            <div className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">
              Environment
            </div>
            {currentProject.environments.map((env) => (
              <button
                key={env.slug}
                type="button"
                onClick={() => {
                  setEnvironment(env.slug);
                  setSecretPath("/");
                }}
                className="flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
              >
                <div className="flex items-center gap-2">
                  <LayersIcon className="size-4 text-muted" />
                  <span>{env.name}</span>
                </div>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1 border-b border-border p-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  if (secretPath === "/") setEnvironment(null);
                  else setSecretPath(parentPath(secretPath));
                }}
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
              <span className="truncate font-mono text-xs text-muted">
                {environment}
                {secretPath === "/" ? "/" : secretPath}
              </span>
            </div>
            <div className="p-2">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                />
              </InputGroup>
            </div>
            <div className="max-h-64 thin-scrollbar overflow-y-auto pb-1">
              {!visibleFolders.length && !visibleSecrets.length && (
                <div className="flex items-center justify-center py-6 text-sm text-muted">
                  Nothing here
                </div>
              )}
              {visibleFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setSecretPath(joinPath(secretPath, folder.name));
                    setSearch("");
                  }}
                  className="flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
                >
                  <div className="flex items-center gap-2">
                    <FolderIcon className="size-4 text-warning" />
                    <span className="truncate">{folder.name}</span>
                  </div>
                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
                </button>
              ))}
              {Boolean(visibleFolders.length) && Boolean(visibleSecrets.length) && (
                <div className="my-1 border-t border-border" />
              )}
              {visibleSecrets.map((secret) => (
                <button
                  key={secret.id}
                  type="button"
                  onClick={() => {
                    onChange({
                      environment: environment as string,
                      secretPath,
                      secretKey: secret.key
                    });
                    setIsOpen(false);
                  }}
                  className="group flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10"
                >
                  <div className="flex items-center gap-2">
                    <KeyRoundIcon className="size-4 text-muted" />
                    <span className="truncate">{secret.key}</span>
                  </div>
                  <span className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
                    select
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
