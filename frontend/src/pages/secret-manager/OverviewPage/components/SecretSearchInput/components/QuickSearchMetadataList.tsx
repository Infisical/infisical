import { FilterIcon } from "lucide-react";

import { Badge, Button, HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";

export type QuickSearchMetadata = { key: string; value: string | null };

type Props = {
  metadata?: QuickSearchMetadata[];
  onApplyFilter: (metadata: QuickSearchMetadata) => void;
};

export const QuickSearchMetadataList = ({ metadata = [], onApplyFilter }: Props) => {
  if (metadata.length === 0) return <span className="text-muted">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {metadata.map((entry) => (
        <HoverCard key={`${entry.key}-${entry.value ?? ""}`} openDelay={200} closeDelay={150}>
          <HoverCardTrigger asChild>
            <Badge
              variant="outline"
              tabIndex={0}
              aria-label={`${entry.key}: ${entry.value || "empty"}`}
              className="cursor-default gap-1.5 border-border font-mono font-normal"
            >
              <span className="text-muted">{entry.key}</span>
              <span className="text-foreground">{entry.value || "—"}</span>
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            className="w-56"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-2.5">
              <div className="min-w-0 font-mono text-xs">
                <p className="break-all text-muted">{entry.key}</p>
                <p className="break-all text-foreground">{entry.value || "—"}</p>
              </div>
              <Button
                variant="outline"
                size="xs"
                isDisabled={!entry.value}
                onClick={(event) => {
                  event.stopPropagation();
                  onApplyFilter(entry);
                }}
              >
                <FilterIcon />
                Apply Filter
              </Button>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  );
};
