import { useMemo, useState } from "react";
import {
  CheckIcon,
  FilterIcon,
  FingerprintIcon,
  FolderIcon,
  KeyIcon,
  RefreshCw,
  SearchIcon,
  TagsIcon
} from "lucide-react";

import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuSub,
  UnstableDropdownMenuSubContent,
  UnstableDropdownMenuSubTrigger,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePageLoader,
  UnstableTable,
  UnstableTableBody,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { WsTag } from "@app/hooks/api/tags/types";
import { groupBy } from "@app/lib/fn/array";
import { QuickSearchSecretRotationItem } from "@app/pages/secret-manager/OverviewPage/components/SecretSearchInput/components/QuickSearchSecretRotationItem";
import { RowType } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.types";

import { QuickSearchDynamicSecretItem } from "./QuickSearchDynamicSecretItem";
import { QuickSearchFolderItem } from "./QuickSearchFolderItem";
import { QuickSearchSecretItem } from "./QuickSearchSecretItem";

export type QuickSearchModalProps = {
  environments: ProjectEnv[];
  projectId: string;
  tags?: WsTag[];
  isSingleEnv?: boolean;
  initialValue: string;
  onClose: () => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ResourceType =
  | RowType.Secret
  | RowType.DynamicSecret
  | RowType.Folder
  | RowType.SecretRotation;

const Content = ({
  environments,
  projectId,
  onClose,
  tags,
  initialValue = ""
}: Omit<QuickSearchModalProps, "isOpen" | "onOpenChange" | "isSingleEnv">) => {
  const [search, setSearch] = useState(initialValue);
  const [debouncedSearch] = useDebounce(search);
  const [filterTags, setFilterTags] = useState<Record<string, boolean>>({});
  const [showFilter, setShowFilter] = useState<Record<ResourceType, boolean>>({
    [RowType.Secret]: true,
    [RowType.Folder]: true,
    [RowType.DynamicSecret]: true,
    [RowType.SecretRotation]: true
  });
  const isEnabled = Boolean(search.trim()) || Boolean(Object.values(filterTags).length);
  const { data, isPending } = useGetProjectSecretsQuickSearch(
    {
      secretPath: "/",
      environments: environments.map((env) => env.slug),
      projectId,
      search: debouncedSearch,
      tags: filterTags
    },
    { enabled: isEnabled }
  );

  const { folders = {}, secrets = {}, dynamicSecrets = {}, secretRotations = {} } = data ?? {};

  const envIdToSlug = useMemo(
    () => new Map(environments.map((env) => [env.id, env.slug])),
    [environments]
  );

  const resultsByEnv = useMemo(() => {
    const allFolders = Object.values(folders).flat();
    const allSecrets = Object.values(secrets).flat();
    const allDynamicSecrets = Object.values(dynamicSecrets).flat();
    const allRotations = Object.values(secretRotations).flat();

    const foldersByEnv = groupBy(
      allFolders,
      (folder) => envIdToSlug.get(folder.envId) ?? folder.envId
    );
    const secretsByEnv = groupBy(allSecrets, (secret) => secret.env);
    const dynamicSecretsByEnv = groupBy(allDynamicSecrets, (ds) => ds.environment);
    const rotationsByEnv = groupBy(allRotations, (r) => r.environment.slug);

    return environments
      .map((env) => {
        const envFolders = showFilter[RowType.Folder] ? (foldersByEnv[env.slug] ?? []) : [];
        const envSecrets = showFilter[RowType.Secret] ? (secretsByEnv[env.slug] ?? []) : [];
        const envDynamicSecrets = showFilter[RowType.DynamicSecret]
          ? (dynamicSecretsByEnv[env.slug] ?? [])
          : [];
        const envRotations = showFilter[RowType.SecretRotation]
          ? (rotationsByEnv[env.slug] ?? [])
          : [];

        const total =
          envFolders.length + envSecrets.length + envDynamicSecrets.length + envRotations.length;

        return {
          env,
          folders: envFolders,
          secrets: envSecrets,
          dynamicSecrets: envDynamicSecrets,
          secretRotations: envRotations,
          total
        };
      })
      .filter((group) => group.total > 0);
  }, [folders, secrets, dynamicSecrets, secretRotations, environments, envIdToSlug, showFilter]);

  const isEmpty = resultsByEnv.length === 0;

  const handleToggleTag = (tag: string) => {
    setFilterTags((prev) => {
      const updated = { ...prev };
      if (prev[tag]) delete updated[tag];
      else updated[tag] = true;
      return updated;
    });
  };

  const handleToggleShowType = (type: ResourceType) => {
    setShowFilter((prev) => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const hasActiveFilters =
    Object.keys(filterTags).length > 0 || Object.values(showFilter).some((show) => !show);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div className="flex gap-2 border-b border-border pb-4">
        <UnstableDropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <UnstableDropdownMenuTrigger asChild>
                <UnstableIconButton variant={hasActiveFilters ? "project" : "outline"}>
                  <FilterIcon />
                </UnstableIconButton>
              </UnstableDropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Search Filters</TooltipContent>
          </Tooltip>
          <UnstableDropdownMenuContent align="start">
            <UnstableDropdownMenuLabel>Filter By</UnstableDropdownMenuLabel>
            <UnstableDropdownMenuCheckboxItem
              checked={showFilter[RowType.Folder]}
              onCheckedChange={() => handleToggleShowType(RowType.Folder)}
              onSelect={(e) => e.preventDefault()}
            >
              <FolderIcon className="text-folder" />
              Folders
            </UnstableDropdownMenuCheckboxItem>
            <UnstableDropdownMenuCheckboxItem
              checked={showFilter[RowType.DynamicSecret]}
              onCheckedChange={() => handleToggleShowType(RowType.DynamicSecret)}
              onSelect={(e) => e.preventDefault()}
            >
              <FingerprintIcon className="text-dynamic-secret" />
              Dynamic Secrets
            </UnstableDropdownMenuCheckboxItem>
            <UnstableDropdownMenuCheckboxItem
              checked={showFilter[RowType.SecretRotation]}
              onCheckedChange={() => handleToggleShowType(RowType.SecretRotation)}
              onSelect={(e) => e.preventDefault()}
            >
              <RefreshCw className="text-secret-rotation" />
              Secret Rotations
            </UnstableDropdownMenuCheckboxItem>
            <UnstableDropdownMenuCheckboxItem
              checked={showFilter[RowType.Secret]}
              onCheckedChange={() => handleToggleShowType(RowType.Secret)}
              onSelect={(e) => e.preventDefault()}
            >
              <KeyIcon className="text-secret" />
              Secrets
            </UnstableDropdownMenuCheckboxItem>
            {tags && tags.length > 0 && (
              <UnstableDropdownMenuSub>
                <UnstableDropdownMenuSubTrigger className="relative">
                  <TagsIcon className="size-4 text-secret" />
                  Tags
                  {Object.keys(filterTags).length > 0 && (
                    <Badge variant="project" className="absolute right-7">
                      {Object.keys(filterTags).length}
                    </Badge>
                  )}
                </UnstableDropdownMenuSubTrigger>
                <UnstableDropdownMenuSubContent className="p-0">
                  <Command>
                    <CommandInput placeholder="Filter tags..." />
                    <CommandList>
                      <CommandEmpty>No tags found.</CommandEmpty>
                      <CommandGroup>
                        {tags.map(({ id, slug }) => (
                          <CommandItem key={id} value={slug} onSelect={() => handleToggleTag(slug)}>
                            {slug}
                            {filterTags[slug] && <CheckIcon className="ml-auto" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </UnstableDropdownMenuSubContent>
              </UnstableDropdownMenuSub>
            )}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by resource name, secret metadata or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="min-h-0 thin-scrollbar flex-1 overflow-y-auto pt-4">
        {/* eslint-disable-next-line no-nested-ternary */}
        {isEnabled ? (
          // eslint-disable-next-line no-nested-ternary
          isPending ? (
            <UnstablePageLoader />
          ) : isEmpty ? (
            <UnstableEmpty className="mt-7 border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>No results match search.</UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  Try updating your search filters...
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
            </UnstableEmpty>
          ) : (
            <div className="flex flex-col gap-6">
              {resultsByEnv.map(
                ({
                  env,
                  folders: envFolders,
                  secrets: envSecrets,
                  dynamicSecrets: envDynamic,
                  secretRotations: envRotations
                }) => (
                  <div key={env.slug}>
                    <h3 className="mb-2 text-sm font-medium text-foreground">{env.name}</h3>
                    <UnstableTable>
                      <UnstableTableHeader>
                        <UnstableTableRow>
                          <UnstableTableHead className="w-8" />
                          <UnstableTableHead>Name</UnstableTableHead>
                          <UnstableTableHead>Location</UnstableTableHead>
                          <UnstableTableHead className="w-24" />
                        </UnstableTableRow>
                      </UnstableTableHeader>
                      <UnstableTableBody>
                        {envFolders.map((folder) => (
                          <QuickSearchFolderItem
                            key={folder.id}
                            folder={folder}
                            envSlug={env.slug}
                            onClose={onClose}
                          />
                        ))}
                        {envDynamic.map((ds) => (
                          <QuickSearchDynamicSecretItem
                            key={ds.id}
                            dynamicSecret={ds}
                            envSlug={env.slug}
                            onClose={onClose}
                          />
                        ))}
                        {envRotations.map((rotation) => (
                          <QuickSearchSecretRotationItem
                            key={rotation.id}
                            secretRotation={rotation}
                            envSlug={env.slug}
                            onClose={onClose}
                          />
                        ))}
                        {envSecrets.map((secret) => (
                          <QuickSearchSecretItem
                            key={secret.id}
                            secret={secret}
                            envSlug={env.slug}
                            search={debouncedSearch}
                            tags={Object.keys(filterTags)}
                            onClose={onClose}
                          />
                        ))}
                      </UnstableTableBody>
                    </UnstableTable>
                  </div>
                )
              )}
            </div>
          )
        ) : (
          <UnstableEmpty className="mt-7 border">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>Start typing to begin search...</UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Search by resource name, secret metadata or tag...
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        )}
      </div>
    </div>
  );
};

export const QuickSearchModal = ({
  isOpen,
  isSingleEnv,
  onOpenChange,
  ...props
}: QuickSearchModalProps) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden sm:max-w-7xl">
        <SheetHeader>
          <SheetTitle>{`Search All Folders${isSingleEnv ? " In Environment" : ""}`}</SheetTitle>
          <SheetDescription>
            {`Search the ${
              isSingleEnv ? "current environment" : "entire project"
            } to quickly reference secrets and navigate deeply.`}
          </SheetDescription>
        </SheetHeader>
        <Content {...props} />
      </SheetContent>
    </Sheet>
  );
};
