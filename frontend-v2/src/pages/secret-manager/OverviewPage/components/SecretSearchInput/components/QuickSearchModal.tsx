import { useState } from "react";
import {
  faCheckCircle,
  faChevronLeft,
  faFilter,
  faFingerprint,
  faFolder,
  faKey,
  faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Spinner,
  Table,
  TableContainer,
  Tooltip
} from "@app/components/v2";
import { useDebounce } from "@app/hooks";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
import { WsTag } from "@app/hooks/api/tags/types";
import { WorkspaceEnv } from "@app/hooks/api/workspace/types";
import { RowType } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.types";

import { QuickSearchDynamicSecretItem } from "./QuickSearchDynamicSecretItem";
import { QuickSearchFolderItem } from "./QuickSearchFolderItem";
import { QuickSearchSecretItem } from "./QuickSearchSecretItem";

export type QuickSearchModalProps = {
  environments: WorkspaceEnv[];
  projectId: string;
  tags?: WsTag[];
  isSingleEnv?: boolean;
  initialValue: string;
  onClose: () => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ResourceType = RowType.Secret | RowType.DynamicSecret | RowType.Folder;

const Content = ({
  environments,
  projectId,
  onClose,
  tags,
  initialValue = "",
  isSingleEnv
}: Omit<QuickSearchModalProps, "isOpen" | "onOpenChange">) => {
  const [search, setSearch] = useState(initialValue);
  const [debouncedSearch] = useDebounce(search);
  const [filterTags, setFilterTags] = useState<Record<string, boolean>>({});
  const [showFilter, setShowFilter] = useState<Record<ResourceType, boolean>>({
    [RowType.Secret]: true,
    [RowType.Folder]: true,
    [RowType.DynamicSecret]: true
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

  const { folders = {}, secrets = {}, dynamicSecrets = {} } = data ?? {};

  const isEmpty =
    (!showFilter[RowType.Folder] || Object.values(folders).length === 0) &&
    (!showFilter[RowType.Secret] || Object.values(secrets).length === 0) &&
    (!showFilter[RowType.DynamicSecret] || Object.values(dynamicSecrets).length === 0);

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

  return (
    <div className="min-h-[14.6rem]">
      <div className="flex gap-2">
        <Input
          className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
          placeholder="Search by secret, folder or tag name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={
            <FontAwesomeIcon icon={faMagnifyingGlass} className={search ? "text-primary" : ""} />
          }
        />
        <DropdownMenu>
          <Tooltip content="Search Filters">
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="outline_bg"
                ariaLabel="Filter secrets by tag(s)"
                className={twMerge(
                  "transition-all",
                  (Object.keys(filterTags).length ||
                    Object.values(showFilter).some((show) => !show)) &&
                    "border-primary/50 text-primary"
                )}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="p-0">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handleToggleShowType(RowType.Folder);
              }}
              icon={showFilter[RowType.Folder] && <FontAwesomeIcon icon={faCheckCircle} />}
              iconPos="right"
            >
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
                <span>Folders</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handleToggleShowType(RowType.DynamicSecret);
              }}
              icon={showFilter[RowType.DynamicSecret] && <FontAwesomeIcon icon={faCheckCircle} />}
              iconPos="right"
            >
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFingerprint} className="text-yellow-700" />
                <span>Dynamic Secrets</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handleToggleShowType(RowType.Secret);
              }}
              icon={showFilter[RowType.Secret] && <FontAwesomeIcon icon={faCheckCircle} />}
              iconPos="right"
            >
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faKey} className="text-bunker-300" />
                <span>Secrets</span>
              </div>
            </DropdownMenuItem>
            {tags && tags.length > 0 && (
              <DropdownSubMenu>
                <DropdownSubMenuTrigger
                  iconPos="left"
                  icon={<FontAwesomeIcon icon={faChevronLeft} size="sm" />}
                >
                  Tags
                </DropdownSubMenuTrigger>
                <DropdownSubMenuContent
                  collisionPadding={{ right: Infinity }} // forces dropdown to left
                  className="thin-scrollbar max-h-[20rem] overflow-y-auto rounded-r-none"
                >
                  <DropdownMenuLabel>Filter Secrets by Tag(s)</DropdownMenuLabel>
                  {tags.map(({ id, slug, color }) => (
                    <DropdownMenuItem
                      onClick={(evt) => {
                        evt.preventDefault();
                        handleToggleTag(slug);
                      }}
                      key={id}
                      icon={filterTags[slug] && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      <div className="flex items-center">
                        <div
                          className="mr-2 h-2 w-2 rounded-full"
                          style={{ background: color || "#bec2c8" }}
                        />
                        {slug}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownSubMenuContent>
              </DropdownSubMenu>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 max-h-[19rem] min-h-[19rem] overflow-auto">
        {/* eslint-disable-next-line no-nested-ternary */}
        {isEnabled ? (
          // eslint-disable-next-line no-nested-ternary
          isPending ? (
            <Spinner size="lg" className="mx-auto mt-24 text-mineshaft-900" />
          ) : isEmpty ? (
            <EmptyState
              className="mt-24"
              title="No results match search."
              icon={faMagnifyingGlass}
            />
          ) : (
            <TableContainer className="thin-scrollbar h-full overflow-y-auto">
              <Table>
                {showFilter[RowType.Folder] &&
                  Object.entries(folders).map(([key, folderGroup]) => (
                    <QuickSearchFolderItem onClose={onClose} folderGroup={folderGroup} key={key} />
                  ))}
                {showFilter[RowType.DynamicSecret] &&
                  Object.entries(dynamicSecrets).map(([key, dynamicSecretGroup]) => (
                    <QuickSearchDynamicSecretItem
                      onClose={onClose}
                      dynamicSecretGroup={dynamicSecretGroup}
                      key={key}
                    />
                  ))}
                {showFilter[RowType.Secret] &&
                  Object.entries(secrets).map(([key, secretGroup]) => (
                    <QuickSearchSecretItem
                      search={debouncedSearch}
                      tags={Object.keys(filterTags)}
                      isSingleEnv={isSingleEnv}
                      environments={environments}
                      onClose={onClose}
                      secretGroup={secretGroup}
                      key={key}
                    />
                  ))}
              </Table>
            </TableContainer>
          )
        ) : (
          <EmptyState
            className="mt-24"
            title="Start typing to begin search..."
            icon={faMagnifyingGlass}
          />
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title={`Search All Folders${isSingleEnv ? " In Environment" : ""}`}
        subTitle={`Search the ${
          isSingleEnv ? "current environment" : "entire project"
        } to quickly reference secrets and navigate deeply.`}
      >
        <Content isSingleEnv={isSingleEnv} {...props} />
      </ModalContent>
    </Modal>
  );
};
