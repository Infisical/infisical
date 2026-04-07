import { useMemo, useState } from "react";
import {
  FilterIcon,
  FingerprintIcon,
  FolderIcon,
  KeyIcon,
  RefreshCw,
  SearchIcon
} from "lucide-react";

import {
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
  UnstableDropdownMenuContent,
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
import {
  ResourceFilterMenuContent,
  type ResourceTypeOption
} from "@app/pages/secret-manager/OverviewPage/components/ResourceFilter";
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

const QUICK_SEARCH_RESOURCE_TYPES: ResourceTypeOption[] = [
  { type: RowType.Folder, label: "Folders", icon: <FolderIcon className="text-folder" /> },
  {
    type: RowType.DynamicSecret,
    label: "Dynamic Secrets",
    icon: <FingerprintIcon className="text-dynamic-secret" />
  },
  {
    type: RowType.SecretRotation,
    label: "Secret Rotations",
    icon: <RefreshCw className="text-secret-rotation" />
  },
  { type: RowType.Secret, label: "Secrets", icon: <KeyIcon className="text-secret" /> }
];

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
    [RowType.Secret]: false,
    [RowType.Folder]: false,
    [RowType.DynamicSecret]: false,
    [RowType.SecretRotation]: false
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

    // When no resource types are checked, show all (empty filter = no filter)
    const hasActiveResourceFilter = Object.values(showFilter).some(Boolean);
    const showType = (type: ResourceType) => !hasActiveResourceFilter || showFilter[type];

    return environments
      .map((env) => {
        const envFolders = showType(RowType.Folder) ? (foldersByEnv[env.slug] ?? []) : [];
        const envSecrets = showType(RowType.Secret) ? (secretsByEnv[env.slug] ?? []) : [];
        const envDynamicSecrets = showType(RowType.DynamicSecret)
          ? (dynamicSecretsByEnv[env.slug] ?? [])
          : [];
        const envRotations = showType(RowType.SecretRotation)
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
      if (prev[tag]) {
        delete updated[tag];
      } else {
        updated[tag] = true;
        setShowFilter((f) => ({ ...f, [RowType.Secret]: true }));
      }
      return updated;
    });
  };

  const handleClearTags = () => {
    setFilterTags({});
  };

  const handleToggleShowType = (type: string) => {
    setShowFilter((prev) => {
      const newValue = !prev[type as ResourceType];
      if (type === RowType.Secret && !newValue) {
        setFilterTags({});
      }
      return {
        ...prev,
        [type]: newValue
      };
    });
  };

  const hasActiveFilters =
    Object.keys(filterTags).length > 0 || Object.values(showFilter).some(Boolean);

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
            <ResourceFilterMenuContent
              resourceTypes={QUICK_SEARCH_RESOURCE_TYPES}
              resourceTypeFilter={showFilter}
              onToggleResourceType={handleToggleShowType}
              tags={tags}
              selectedTagSlugs={filterTags}
              onToggleTag={handleToggleTag}
              onClearTags={handleClearTags}
              menuLabel="Filter By"
            />
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
