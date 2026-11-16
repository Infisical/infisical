import { ChevronRightIcon, FolderIcon, LayersIcon } from "lucide-react";

type Props = {
  environmentName: string;
  folderPath: string;
};

export const FolderPathBreadcrumb = ({ environmentName, folderPath }: Props) => (
  <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-neutral/5 px-3 py-2 text-xs">
    <LayersIcon className="size-3.5 shrink-0 text-muted" />
    <span className="shrink-0 text-foreground">{environmentName}</span>
    <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
    <FolderIcon className="size-3.5 shrink-0 text-folder" />
    <span className="truncate font-mono text-foreground">{folderPath}</span>
  </div>
);
