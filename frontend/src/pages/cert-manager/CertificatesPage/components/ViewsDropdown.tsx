import { ChevronDownIcon, Trash2Icon } from "lucide-react";

import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuRadioGroup,
  UnstableDropdownMenuRadioItem,
  UnstableDropdownMenuSeparator,
  UnstableDropdownMenuTrigger
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
  customViews: (TCertificateInventoryView & { isSystem: false })[];
  onSelectView: (viewId: string, filters: TInventoryViewFilters | TSystemViewFilters) => void;
  onDeleteView: (viewId: string) => void;
};

export const ViewsDropdown = ({
  activeViewId,
  systemViews,
  customViews,
  onSelectView,
  onDeleteView
}: Props) => {
  const activeView =
    systemViews.find((v) => v.id === activeViewId) ||
    customViews.find((v) => v.id === activeViewId);
  const label = activeView?.name || "All Certificates";

  return (
    <UnstableDropdownMenu>
      <UnstableDropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select certificate view"
          className="flex h-9 w-[190px] items-center justify-between rounded-md border border-border px-3 text-sm text-foreground transition-all hover:border-foreground/50 hover:bg-foreground/20"
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted" />
        </button>
      </UnstableDropdownMenuTrigger>
      <UnstableDropdownMenuContent sideOffset={2} className="w-64" align="end">
        <UnstableDropdownMenuLabel>System Views</UnstableDropdownMenuLabel>
        <UnstableDropdownMenuRadioGroup value={activeViewId || "system-all"}>
          {systemViews.map((view) => (
            <UnstableDropdownMenuRadioItem
              key={view.id}
              value={view.id}
              onClick={() => onSelectView(view.id, view.filters)}
            >
              {view.name}
            </UnstableDropdownMenuRadioItem>
          ))}
        </UnstableDropdownMenuRadioGroup>

        <UnstableDropdownMenuSeparator />

        <UnstableDropdownMenuLabel>Custom Views</UnstableDropdownMenuLabel>
        {customViews.length === 0 ? (
          <div className="px-2 py-2 text-center text-xs text-muted">
            No custom views saved yet.
            <br />
            Apply filters and click &quot;Save as View&quot;
          </div>
        ) : (
          <UnstableDropdownMenuRadioGroup value={activeViewId || ""}>
            {customViews.map((view) => (
              <UnstableDropdownMenuRadioItem
                key={view.id}
                value={view.id}
                className="group"
                onClick={() => onSelectView(view.id, view.filters as Record<string, unknown>)}
              >
                <span className="flex-1">{view.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteView(view.id);
                  }}
                  className="ml-2 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </UnstableDropdownMenuRadioItem>
            ))}
          </UnstableDropdownMenuRadioGroup>
        )}
      </UnstableDropdownMenuContent>
    </UnstableDropdownMenu>
  );
};
