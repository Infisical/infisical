import { useState } from "react";
import { faCheckCircle, faMagnifyingGlass, faTags } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Spinner,
  Table,
  TableContainer
} from "@app/components/v2";
import { useDebounce } from "@app/hooks";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
import { WsTag } from "@app/hooks/api/tags/types";
import { WorkspaceEnv } from "@app/hooks/api/workspace/types";

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
  const isEnabled = Boolean(search.trim()) || Boolean(Object.values(filterTags).length);
  const { data, isLoading } = useGetProjectSecretsQuickSearch(
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
    Object.values(folders).length === 0 &&
    Object.values(secrets).length === 0 &&
    Object.values(dynamicSecrets).length === 0;

  const handleToggleTag = (tag: string) => {
    setFilterTags((prev) => {
      const updated = { ...prev };
      if (prev[tag]) delete updated[tag];
      else updated[tag] = true;
      return updated;
    });
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
        {tags && tags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="outline_bg"
                ariaLabel="Filter secrets by tag(s)"
                className={twMerge(
                  "transition-all",
                  Object.keys(filterTags).length && "border-primary/50 text-primary"
                )}
              >
                <FontAwesomeIcon icon={faTags} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="thin-scrollbar max-h-[20rem] overflow-y-auto p-0"
            >
              <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                Filter Secrets by Tag(s)
              </DropdownMenuLabel>
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className=" mt-4 max-h-[19rem] min-h-[19rem] overflow-auto">
        {/* eslint-disable-next-line no-nested-ternary */}
        {isEnabled ? (
          // eslint-disable-next-line no-nested-ternary
          isLoading ? (
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
                {Object.entries(folders).map(([key, folderGroup]) => (
                  <QuickSearchFolderItem onClose={onClose} folderGroup={folderGroup} key={key} />
                ))}
                {Object.entries(dynamicSecrets).map(([key, dynamicSecretGroup]) => (
                  <QuickSearchDynamicSecretItem
                    onClose={onClose}
                    dynamicSecretGroup={dynamicSecretGroup}
                    key={key}
                  />
                ))}
                {Object.entries(secrets).map(([key, secretGroup]) => (
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
