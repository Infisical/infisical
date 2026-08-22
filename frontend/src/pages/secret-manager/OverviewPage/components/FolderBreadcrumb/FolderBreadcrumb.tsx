import React, { useCallback, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, FolderIcon, SlashIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  secretPath?: string;
  onResetSearch: (secretPath: string) => void;
};

export function FolderBreadcrumb({ secretPath = "", onResetSearch }: Props) {
  const folderPaths = useMemo(() => (secretPath || "").split("/").filter(Boolean), [secretPath]);

  const [isCopied, , setIsCopied] = useTimedReset<boolean>({ initialState: false });

  const getCrumbPath = useCallback(
    (index: number) => `/${secretPath.split("/").filter(Boolean).slice(0, index).join("/")}`,
    [secretPath]
  );

  // The crumb is a real link, so the browser owns the navigation; this only restores the
  // filters previously used at that depth, and must not run when the click is a new-tab
  // gesture that leaves this tab where it is.
  const onFolderCrumbClick = useCallback(
    (event: React.MouseEvent, index: number) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
        return;
      const newSecPath = getCrumbPath(index);
      if (secretPath === newSecPath) return;
      onResetSearch(newSecPath);
    },
    [getCrumbPath, secretPath, onResetSearch]
  );

  const needsEllipsis = folderPaths.length > 2;
  const startSegments = needsEllipsis ? folderPaths.slice(0, 1) : folderPaths;
  const endSegments = needsEllipsis ? folderPaths.slice(-1) : [];
  const hiddenSegments = needsEllipsis ? folderPaths.slice(1, -1) : [];
  const fullPath = `/${folderPaths.join("/")}`;

  return (
    <div className="relative flex h-7 min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <Breadcrumb className="min-w-0 overflow-hidden">
        <BreadcrumbList className="min-w-0 flex-nowrap">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                from="/organizations/$orgId/projects/secret-management/$projectId/overview"
                to="."
                search={(prev) => ({ ...prev, secretPath: getCrumbPath(0) })}
                onClick={(event) => onFolderCrumbClick(event, 0)}
                aria-label="Root folder"
              >
                <FolderIcon />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {startSegments.map((path, index) => (
            <React.Fragment key={`start-${path}-${index + 1}`}>
              <BreadcrumbSeparator>
                <SlashIcon className="size-3 -rotate-12" />
              </BreadcrumbSeparator>
              {!needsEllipsis && index === startSegments.length - 1 ? (
                <BreadcrumbPage title={path} className="min-w-0 truncate">
                  {path}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbLink asChild title={path} className="min-w-0 truncate">
                    <Link
                      from="/organizations/$orgId/projects/secret-management/$projectId/overview"
                      to="."
                      search={(prev) => ({ ...prev, secretPath: getCrumbPath(index + 1) })}
                      onClick={(event) => onFolderCrumbClick(event, index + 1)}
                    >
                      {path}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              )}
            </React.Fragment>
          ))}

          {hiddenSegments.length > 0 && (
            <>
              <BreadcrumbSeparator>
                <SlashIcon className="size-3 -rotate-12" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span className="data-[state=open]:[&>*]:bg-foreground/10">
                      <BreadcrumbEllipsis className="size-6 cursor-pointer rounded hover:bg-foreground/10" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="relative max-w-[300px] pl-3" align="start">
                    <div className="absolute top-3 bottom-[23px] left-[8px] w-px bg-muted/50" />
                    {hiddenSegments.map((segment, idx) => {
                      const originalIndex = 1 + idx;
                      return (
                        <DropdownMenuItem
                          asChild
                          key={`hidden-${originalIndex}`}
                          className="text-accent hover:text-foreground"
                          title={segment}
                        >
                          <Link
                            from="/organizations/$orgId/projects/secret-management/$projectId/overview"
                            to="."
                            search={(prev) => ({
                              ...prev,
                              secretPath: getCrumbPath(originalIndex + 1)
                            })}
                            onClick={(event) => onFolderCrumbClick(event, originalIndex + 1)}
                          >
                            <div className="absolute top-1/2 -left-[3px] h-px w-2 bg-muted/50 transition-colors" />

                            <FolderIcon className="text-folder" />
                            <span className="truncate">{segment}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
            </>
          )}

          {endSegments[0] && (
            <>
              <BreadcrumbSeparator>
                <SlashIcon className="size-3 -rotate-12" />
              </BreadcrumbSeparator>
              <BreadcrumbPage title={endSegments[0]} className="min-w-0 truncate">
                {endSegments[0]}
              </BreadcrumbPage>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {folderPaths.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost-muted"
              size="xs"
              className="shrink-0"
              aria-label="Copy folder path"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fullPath);
                  setIsCopied(true);
                } catch {
                  // clipboard unavailable (denied or insecure context); keep the un-copied state
                }
              }}
            >
              {isCopied ? <Check /> : <Copy />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{isCopied ? "Copied" : "Copy path"}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
