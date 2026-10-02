import { FolderIcon, KeyIcon, TagsIcon, TrashIcon } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ProjectEnv } from "@app/hooks/api/projects/types";

export type BulkSelectionTableItem = {
  type: "folder" | "secret";
  name: string;
  envSlugs: Set<string>;
};

type Props = {
  action: "delete" | "tag";
  items: BulkSelectionTableItem[];
  environments: ProjectEnv[];
  containerClassName?: string;
};

export const BulkSelectionTable = ({ action, items, environments, containerClassName }: Props) => {
  const ActionIcon = action === "delete" ? TrashIcon : TagsIcon;
  const actionIconClassName = action === "delete" ? "text-danger" : "text-project";

  return (
    <Table containerClassName={cn("max-h-[40vh] overflow-auto", containerClassName)}>
      <TableHeader className="sticky -top-px z-20 bg-container [&_tr]:border-b-0">
        <TableRow>
          <TableHead className="sticky left-0 z-20 w-10 max-w-10 min-w-10 border-b-0 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
            Type
          </TableHead>
          <TableHead className="sticky left-10 z-20 w-32 max-w-32 min-w-32 border-b-0 bg-container shadow-[inset_-1px_0_0_var(--color-border),inset_0_-1px_0_var(--color-border)] sm:w-72 sm:max-w-72 sm:min-w-72">
            Name
          </TableHead>
          {environments.map((environment) => (
            <TableHead
              key={environment.slug}
              className="w-32 max-w-32 border-r border-b-0 text-center shadow-[inset_0_-1px_0_var(--color-border)] last:border-r-0"
              isTruncatable
            >
              {environment.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.type}-${item.name}`} className="group">
            <TableCell className="sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover">
              {item.type === "folder" ? (
                <FolderIcon className="size-4 text-folder" />
              ) : (
                <KeyIcon className="size-4 text-secret" />
              )}
            </TableCell>
            <TableCell
              className="sticky left-10 z-10 w-32 max-w-32 min-w-32 bg-container shadow-[inset_-1px_0_0_var(--color-border)] transition-colors duration-75 group-hover:bg-container-hover sm:w-72 sm:max-w-72 sm:min-w-72"
              isTruncatable
            >
              {item.name}
            </TableCell>
            {environments.map((environment) => (
              <TableCell key={environment.slug} className="border-r text-center last:border-r-0">
                {item.envSlugs.has(environment.slug) ? (
                  <ActionIcon className={cn("inline-block size-4", actionIconClassName)} />
                ) : (
                  <span className="text-muted">&mdash;</span>
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
