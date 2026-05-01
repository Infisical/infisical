import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Sparkles } from "lucide-react";

import { Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/v3";
import { type ChangelogEntry } from "@app/hooks/api/changelog";

const ChangelogCard = ({ item }: { item: ChangelogEntry }) => {
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className="group rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30">
      {item.imageUrl && (
        <div className="mb-3 overflow-hidden rounded-md">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        <span className="shrink-0 text-xs text-muted">{timeAgo}</span>
      </div>
      {item.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">{item.summary}</p>
      {item.ctaUrl && (
        <a
          href={item.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {item.ctaLabel || "Learn more"}
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
};

interface ChangelogDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  items: ChangelogEntry[];
  isLoading: boolean;
}

export const ChangelogDialog = ({
  isOpen,
  onOpenChange,
  items,
  isLoading
}: ChangelogDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-primary" />
            What&apos;s New
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: "calc(80vh - 80px)" }}>
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted">
              Loading announcements...
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="mb-3 size-8 text-muted" />
              <p className="text-sm text-muted">No announcements yet</p>
              <p className="mt-1 text-xs text-muted">
                Check back later for product updates and new features.
              </p>
            </div>
          )}
          {!isLoading && items.length > 0 && (
            <div className="flex flex-col gap-5">
              {items.map((item) => (
                <ChangelogCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
