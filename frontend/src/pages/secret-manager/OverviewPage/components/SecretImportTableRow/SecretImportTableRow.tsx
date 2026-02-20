import React, { useEffect, useMemo } from "react";
import { subject } from "@casl/ability";
import { useDragOperation } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  ChevronDownIcon,
  FolderIcon,
  GripVerticalIcon,
  ImportIcon,
  InfoIcon,
  LayersIcon,
  RefreshCwIcon,
  SearchIcon,
  TrashIcon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  EmptyMedia,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import { useResyncSecretReplication } from "@app/hooks/api";
import { ReservedFolders } from "@app/hooks/api/secretFolders/types";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
import { SecretV3RawSanitized } from "@app/hooks/api/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";
import { SecretImportSecretRow } from "./SecretImportSecretRow";

type ImportedSecretData = {
  environment: string;
  secretPath: string;
  sourceEnv: string;
  secrets: Pick<SecretV3RawSanitized, "id" | "key" | "env" | "isEmpty" | "version">[];
};

type Props = {
  importEnvSlug: string;
  importEnvName: string;
  importPath: string;
  environments: { name: string; slug: string }[];
  isSecretImportInEnv: (importEnvSlug: string, importPath: string, env: string) => boolean;
  getSecretImportByEnv: (
    importEnvSlug: string,
    importPath: string,
    env: string
  ) => TSecretImport | undefined;
  tableWidth: number;
  secretPath: string;
  searchFilter: string;
  onDelete: (secretImport: TSecretImport) => void;
  importedSecrets: ImportedSecretData[];
  index: number;
  secretImport?: TSecretImport;
};

export const SecretImportTableRow = ({
  importEnvSlug,
  importEnvName,
  importPath,
  environments = [],
  isSecretImportInEnv,
  getSecretImportByEnv,
  tableWidth,
  secretPath,
  searchFilter,
  onDelete,
  importedSecrets,
  index,
  secretImport
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);
  const { currentProject } = useProject();
  const resyncSecretReplication = useResyncSecretReplication();

  const isSingleEnvView = environments.length === 1;
  const totalCols = environments.length + 2;

  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvImport = isSingleEnvView
    ? (secretImport ?? getSecretImportByEnv(importEnvSlug, importPath, singleEnvSlug))
    : undefined;

  const {
    ref: sortableRef,
    handleRef,
    isDragging
  } = useSortable({
    id: singleEnvImport?.id ?? "",
    index,
    disabled: !isSingleEnvView
  });

  const { source: dragSource } = useDragOperation();
  const isAnyDragging = dragSource != null;

  const allEnvImportedSecrets = useMemo(() => {
    if (isSingleEnvView) {
      const match = importedSecrets?.find(
        (imp) =>
          imp.environment === importEnvSlug &&
          imp.secretPath === importPath &&
          imp.sourceEnv === singleEnvSlug
      );
      return match ? [match] : [];
    }
    return (
      importedSecrets?.filter(
        (imp) => imp.environment === importEnvSlug && imp.secretPath === importPath
      ) ?? []
    );
  }, [importedSecrets, importEnvSlug, importPath, isSingleEnvView, singleEnvSlug]);

  // Union of unique secret keys across all environments (preserves search/expand behavior)
  const matchingImportedSecrets = useMemo(() => {
    if (allEnvImportedSecrets.length === 0) return [];
    if (isSingleEnvView) return allEnvImportedSecrets[0]?.secrets ?? [];
    const keySet = new Set<string>();
    return allEnvImportedSecrets.flatMap((envData) =>
      envData.secrets.filter((secret) => {
        if (keySet.has(secret.key)) return false;
        keySet.add(secret.key);
        return true;
      })
    );
  }, [allEnvImportedSecrets, isSingleEnvView]);

  // Per-environment secret key sets for multi-env discrepancy detection
  const secretKeysByEnv = useMemo(() => {
    if (isSingleEnvView) return new Map<string, Set<string>>();
    return new Map(
      allEnvImportedSecrets.map((envData) => [
        envData.sourceEnv,
        new Set(envData.secrets.map((s) => s.key))
      ])
    );
  }, [allEnvImportedSecrets, isSingleEnvView]);

  const filteredImportedSecrets = useMemo(() => {
    if (!searchFilter) return matchingImportedSecrets;
    return matchingImportedSecrets.filter((secret) =>
      secret.key.toUpperCase().includes(searchFilter.toUpperCase())
    );
  }, [matchingImportedSecrets, searchFilter]);

  useEffect(() => {
    if (searchFilter) {
      if (filteredImportedSecrets.length > 0) {
        setIsExpanded.on();
      } else {
        setIsExpanded.off();
      }
    }
  }, [searchFilter, filteredImportedSecrets.length]);

  const handleResyncSecretReplication = async (importItem: TSecretImport, envSlug: string) => {
    if (resyncSecretReplication.isPending) return;
    await resyncSecretReplication.mutateAsync({
      id: importItem.id,
      environment: envSlug,
      path: secretPath,
      projectId: currentProject?.id || ""
    });
    createNotification({
      text: "Please refresh the dashboard to view changes",
      type: "success"
    });
  };

  const handleRowClick = () => {
    setIsExpanded.toggle();
  };

  const renderReplicationStatus = (importItem: TSecretImport, envSlug: string) => {
    return (
      <>
        {importItem.lastReplicated && (
          <Tooltip>
            <TooltipTrigger>
              {/* eslint-disable-next-line no-nested-ternary */}
              {!isSingleEnvView ? (
                importItem.isReplicationSuccess ? (
                  <InfoIcon className="text-accent" />
                ) : (
                  <TriangleAlertIcon className="text-danger" />
                )
              ) : (
                <div
                  className={twMerge(
                    "flex w-7 justify-center opacity-100",
                    !importItem.isReplicationSuccess && "text-danger"
                  )}
                >
                  {importItem.isReplicationSuccess ? (
                    <InfoIcon className="size-4 text-accent" />
                  ) : (
                    <TriangleAlertIcon className="size-4" />
                  )}
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <InfoIcon className="size-3" />
                  <span className="text-sm">Last Replication</span>
                </div>
                <span className="pl-4 text-xs text-foreground/50">
                  {new Date(importItem.lastReplicated).toLocaleString()}
                </span>
                {!importItem.isReplicationSuccess && (
                  <>
                    <div className="mt-1 flex items-center gap-1.5">
                      <TriangleAlertIcon className="size-3" />
                      <span className="text-sm">Fail reason</span>
                    </div>
                    <span className="pl-4 text-xs text-muted">{importItem.replicationStatus}</span>
                  </>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        {isSingleEnvView && importItem.isReplication && (
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={subject(ProjectPermissionSub.SecretImports, {
              environment: envSlug,
              secretPath: secretPath || "/"
            })}
            renderTooltip
            allowedLabel="Resync replicated secrets"
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    className={twMerge(
                      "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100",
                      resyncSecretReplication.isPending && "w-7 animate-spin opacity-100"
                    )}
                    isDisabled={!isAllowed}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResyncSecretReplication(importItem, envSlug);
                    }}
                  >
                    <RefreshCwIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Resync</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        )}
      </>
    );
  };

  const renderSingleEnvActions = () => {
    if (!singleEnvImport) return null;

    return (
      <div className="flex items-center transition-all duration-500 group-hover:ml-2 group-hover:space-x-1.5">
        {renderReplicationStatus(singleEnvImport, singleEnvSlug)}
        <ProjectPermissionCan
          I={ProjectPermissionActions.Delete}
          a={subject(ProjectPermissionSub.SecretImports, {
            environment: singleEnvSlug,
            secretPath: secretPath || "/"
          })}
          renderTooltip
          allowedLabel="Delete"
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100 hover:text-danger"
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(singleEnvImport);
                  }}
                >
                  <TrashIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
      </div>
    );
  };

  const renderMultiEnvExpandedSecrets = () => {
    if (filteredImportedSecrets.length === 0) {
      return (
        <UnstableEmpty className="bg-transparent">
          <UnstableEmptyHeader>
            <EmptyMedia variant="icon">
              {matchingImportedSecrets.length ? <SearchIcon /> : <ImportIcon />}
            </EmptyMedia>
            <UnstableEmptyTitle>
              {matchingImportedSecrets.length
                ? "No imported secrets match search"
                : "No imported secrets found"}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      );
    }

    const hasAnyDiscrepancy = filteredImportedSecrets.some((secret) =>
      Array.from(secretKeysByEnv.values()).some((keys) => !keys.has(secret.key))
    );

    const firstEnvImport = allEnvImportedSecrets.length > 0
      ? getSecretImportByEnv(importEnvSlug, importPath, allEnvImportedSecrets[0].sourceEnv)
      : undefined;
    const isReplicated = firstEnvImport?.isReplication;

    return (
      <UnstableTable containerClassName="border-none rounded-none bg-transparent">
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead className="w-1/2">Name</UnstableTableHead>
            <UnstableTableHead className="w-1/2">Value</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {filteredImportedSecrets.map((secret) => {
            const missingEnvNames = environments
              .filter(
                (env) =>
                  secretKeysByEnv.has(env.slug) && !secretKeysByEnv.get(env.slug)!.has(secret.key)
              )
              .map((env) => env.name);

            return (
              <SecretImportSecretRow
                key={`import-secret-multi-${secret.key}`}
                secretKey={secret.key}
                environment={isReplicated ? allEnvImportedSecrets[0].sourceEnv : importEnvSlug}
                secretPath={
                  isReplicated && firstEnvImport
                    ? `${secretPath === "/" ? "" : secretPath}/${ReservedFolders.SecretReplication}${firstEnvImport.id}`
                    : importPath
                }
                isEmpty={secret.isEmpty}
                missingFromEnvs={missingEnvNames}
              />
            );
          })}
        </UnstableTableBody>
        {hasAnyDiscrepancy && (
          <caption className="ml-2 caption-bottom pt-3 text-left">
            <div className="flex items-center gap-1.5 text-xs text-warning">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              <span>
                One or more replicated imports may be out of sync. Secrets marked with a warning
                indicator are not present across all linked environments.
              </span>
            </div>
          </caption>
        )}
      </UnstableTable>
    );
  };

  const renderExpandedSecrets = (envSlug: string) => {
    if (filteredImportedSecrets.length === 0) {
      return (
        <UnstableEmpty className="bg-transparent shadow-none">
          <UnstableEmptyHeader>
            <EmptyMedia variant="icon">
              {matchingImportedSecrets.length ? <SearchIcon /> : <ImportIcon />}
            </EmptyMedia>
            <UnstableEmptyTitle>
              {matchingImportedSecrets.length
                ? "No imported secrets match search"
                : "No imported secrets found"}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      );
    }

    return (
      <UnstableTable containerClassName="border-none rounded-none bg-transparent">
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead className="w-1/2">Name</UnstableTableHead>
            <UnstableTableHead className="w-1/2">Value</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {filteredImportedSecrets.map((secret) => (
            <SecretImportSecretRow
              key={`import-secret-${envSlug}-${secret.key}`}
              secretKey={secret.key}
              environment={singleEnvImport?.isReplication ? singleEnvSlug : importEnvSlug}
              secretPath={
                singleEnvImport?.isReplication
                  ? `${secretPath === "/" ? "" : secretPath}/${ReservedFolders.SecretReplication}${singleEnvImport.id}`
                  : importPath
              }
              isEmpty={secret.isEmpty}
            />
          ))}
        </UnstableTableBody>
      </UnstableTable>
    );
  };

  return (
    <>
      <UnstableTableRow
        ref={isSingleEnvView ? (sortableRef as React.Ref<HTMLTableRowElement>) : undefined}
        onClick={handleRowClick}
        className={twMerge("group", isDragging && "opacity-50")}
      >
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover",
            isSingleEnvView && "relative"
          )}
        >
          {/* eslint-disable-next-line no-nested-ternary */}
          {isSingleEnvView ? (
            <>
              <button
                type="button"
                ref={handleRef}
                className="absolute inset-0 flex cursor-grab items-center justify-center text-muted opacity-0 group-hover:opacity-100"
              >
                <GripVerticalIcon className="size-4" />
              </button>
              <ImportIcon className="text-import group-hover:invisible" />
            </>
          ) : isExpanded ? (
            <ChevronDownIcon />
          ) : (
            <ImportIcon className="text-import" />
          )}
        </UnstableTableCell>
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-10 z-10 border-r",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
          colSpan={isSingleEnvView ? 2 : undefined}
        >
          <div className="flex w-full items-center">
            <div className="flex items-center gap-2 overflow-hidden">
              <Badge variant="neutral">
                <LayersIcon />
                {importEnvName}
              </Badge>
              <FolderIcon className="size-3.5 shrink-0 text-folder" />
              <span className="truncate">{importPath}</span>
            </div>
            {isSingleEnvView && (
              <div className="ml-auto flex items-center">{renderSingleEnvActions()}</div>
            )}
          </div>
        </UnstableTableCell>
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded)
              return (
                <UnstableTableCell
                  key={`import-env-expanded-${slug}`}
                  className="border-b-0 bg-container-hover"
                />
              );

            const isPresent = isSecretImportInEnv(importEnvSlug, importPath, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`import-overview-${slug}-${i + 1}`}
                status={isPresent ? "present" : "missing"}
              />
            );
          })}
      </UnstableTableRow>
      {isExpanded &&
        !isAnyDragging &&
        (isSingleEnvView ? (
          <UnstableTableRow key={`expanded-import-row-${index}`}>
            <UnstableTableCell colSpan={totalCols} className="bg-card p-0">
              <div
                style={{ minWidth: tableWidth, maxWidth: tableWidth }}
                className={twMerge(
                  "sticky left-0 flex flex-col gap-y-4 border-t border-b-1 border-l-1 border-border border-x-project/50 bg-card",
                  filteredImportedSecrets.length !== 0 && "p-4"
                )}
              >
                {renderExpandedSecrets(singleEnvSlug)}
              </div>
            </UnstableTableCell>
          </UnstableTableRow>
        ) : (
          <UnstableTableRow>
            <UnstableTableCell colSpan={totalCols} className="bg-card p-0">
              <div
                style={{ minWidth: tableWidth, maxWidth: tableWidth }}
                className="sticky left-0 flex flex-col gap-y-4 border-t-2 border-b-1 border-l-1 border-border border-x-project/50 bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted">Imported in:</span>
                  {environments
                    .filter((env) => isSecretImportInEnv(importEnvSlug, importPath, env.slug))
                    .map(({ name: envName, slug }) => {
                      const secretImport = getSecretImportByEnv(importEnvSlug, importPath, slug);

                      return (
                        <div
                          key={`import-env-badge-${slug}`}
                          className="group/badge flex items-center gap-1"
                        >
                          <Badge variant="neutral">
                            <LayersIcon />
                            {envName}
                            {secretImport?.isReplication &&
                              renderReplicationStatus(secretImport, slug)}
                          </Badge>
                        </div>
                      );
                    })}
                  <div className="ml-auto flex items-center gap-x-1.5 text-xs text-info">
                    <InfoIcon className="size-3" />
                    Select a single environment to manage imports
                  </div>
                </div>
                {renderMultiEnvExpandedSecrets()}
              </div>
            </UnstableTableCell>
          </UnstableTableRow>
        ))}
    </>
  );
};
