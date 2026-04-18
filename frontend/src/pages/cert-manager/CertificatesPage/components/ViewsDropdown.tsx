import { useState } from "react";
import { CheckIcon, ChevronDownIcon, GlobeIcon, Trash2Icon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TSystemView } from "@app/hooks/api/certificateInventoryViews";
import type {
  TCertificateInventoryView,
  TInventoryViewFilters,
  TSystemViewFilters
} from "@app/hooks/api/certificateInventoryViews/types";

type Props = {
  activeViewId: string | null;
  systemViews: TSystemView[];
  sharedViews: (TCertificateInventoryView & { isSystem: false; isShared: true })[];
  customViews: (TCertificateInventoryView & { isSystem: false; isShared: false })[];
  currentUserId?: string;
  onSelectView: (viewId: string, filters: TInventoryViewFilters | TSystemViewFilters) => void;
  onDeleteView?: (viewId: string) => void;
  onToggleShare?: (viewId: string, isShared: boolean) => void;
};

export const ViewsDropdown = ({
  activeViewId,
  systemViews,
  sharedViews,
  customViews,
  currentUserId,
  onSelectView,
  onDeleteView,
  onToggleShare
}: Props) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const activeView =
    systemViews.find((v) => v.id === activeViewId) ||
    sharedViews.find((v) => v.id === activeViewId) ||
    customViews.find((v) => v.id === activeViewId);
  const label = activeView?.name || "All Certificates";

  const renderActions = (viewId: string, isShared: boolean, isActive = false) => {
    if (!onDeleteView && !onToggleShare) return null;
    if (isActive && pendingDeleteId !== viewId) return null;

    if (pendingDeleteId === viewId && onDeleteView) {
      return (
        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Confirm delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteView(viewId);
                  setPendingDeleteId(null);
                }}
                className="text-muted hover:text-success"
              >
                <CheckIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">Confirm delete</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Cancel delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(null);
                }}
                className="text-muted"
              >
                <XIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">Cancel</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onToggleShare && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label={isShared ? "Make personal" : "Share with team"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleShare(viewId, !isShared);
                }}
                className="text-muted hover:text-foreground"
              >
                <GlobeIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isShared ? "Make personal" : "Share with team"}
            </TooltipContent>
          </Tooltip>
        )}
        {onDeleteView && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Delete view"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(viewId);
                }}
                className="text-muted hover:text-danger"
              >
                <Trash2Icon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">Delete view</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  return (
    <DropdownMenu onOpenChange={() => setPendingDeleteId(null)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select certificate view"
          className="flex h-9 w-[190px] items-center justify-between rounded-md border border-border px-3 text-sm text-foreground transition-all hover:border-foreground/50 hover:bg-foreground/20"
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={2} className="w-64" align="end">
        <DropdownMenuLabel>System Views</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeViewId || "system-all"}>
          {systemViews.map((view) => (
            <DropdownMenuRadioItem
              key={view.id}
              value={view.id}
              onClick={() => onSelectView(view.id, view.filters)}
            >
              {view.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {sharedViews.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Shared Views</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activeViewId || ""}>
              {sharedViews.map((view) => {
                const isOwner = currentUserId && view.createdByUserId === currentUserId;
                return (
                  <DropdownMenuRadioItem
                    key={view.id}
                    value={view.id}
                    className="group relative"
                    onClick={() => onSelectView(view.id, view.filters as Record<string, unknown>)}
                  >
                    <span
                      className={twMerge(
                        "min-w-0 flex-1 truncate",
                        isOwner && activeViewId !== view.id && "group-hover:pr-8"
                      )}
                    >
                      {view.name}
                    </span>
                    {isOwner && renderActions(view.id, true, activeViewId === view.id)}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>My Views</DropdownMenuLabel>
        {customViews.length === 0 ? (
          <div className="px-2 py-2 text-center text-xs text-muted">
            No custom views saved yet.
            <br />
            Apply filters and click &quot;Save as View&quot;
          </div>
        ) : (
          <DropdownMenuRadioGroup value={activeViewId || ""}>
            {customViews.map((view) => (
              <DropdownMenuRadioItem
                key={view.id}
                value={view.id}
                className="group relative"
                onClick={() => onSelectView(view.id, view.filters as Record<string, unknown>)}
              >
                <span
                  className={twMerge(
                    "min-w-0 flex-1 truncate",
                    activeViewId !== view.id && "group-hover:pr-8"
                  )}
                >
                  {view.name}
                </span>
                {renderActions(view.id, false, activeViewId === view.id)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
