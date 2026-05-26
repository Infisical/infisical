import { ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";

import { Empty, EmptyDescription, EmptyTitle } from "@app/components/v3/generic/Empty";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { cn } from "@app/components/v3/utils";

// Shared scroll-region height so every view block (tree, search, personal) lines up.
export const TREE_PICKER_SCROLL_CLASS = "max-h-[320px] min-h-[260px] overflow-y-auto";

export const ListSkeleton = () => (
  <div className="flex flex-col gap-1 p-1">
    {Array.from({ length: 5 }).map((_, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <Skeleton key={i} className="h-8 w-full" />
    ))}
  </div>
);

export const SectionHeading = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pt-2 pb-1 text-[10px] font-medium tracking-wider text-muted uppercase">
    {children}
  </div>
);

export const InlineEmpty = ({ title, description }: { title: string; description?: string }) => (
  <Empty className="border-0 bg-transparent p-6 shadow-none">
    <EmptyTitle>{title}</EmptyTitle>
    {description && <EmptyDescription>{description}</EmptyDescription>}
  </Empty>
);

export const BrowserRow = ({
  icon,
  label,
  meta,
  isSelected = false,
  showChevron = false,
  onClick
}: {
  icon: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  isSelected?: boolean;
  showChevron?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
      "[&_svg]:size-3.5 [&_svg]:shrink-0",
      isSelected
        ? "bg-primary/10 text-foreground"
        : "text-accent hover:bg-foreground/5 hover:text-foreground"
    )}
  >
    <span className={cn("inline-flex shrink-0", isSelected ? "text-primary" : "text-muted")}>
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {meta != null && <span className="shrink-0 text-xs text-muted">{meta}</span>}
    {showChevron && <ChevronRight className="text-muted" />}
    {isSelected && !showChevron && <Check className="text-primary" />}
  </button>
);
