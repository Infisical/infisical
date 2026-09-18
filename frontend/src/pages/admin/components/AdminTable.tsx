import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table as V3Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type TableContainerProps = React.ComponentProps<"div">;
const SKELETON_ROWS = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
const SKELETON_COLUMNS = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

export const TableContainer = ({ className, ...props }: TableContainerProps) => (
  <div className={cn("overflow-x-auto rounded-md border border-border", className)} {...props} />
);

export const Table = ({ containerClassName, ...props }: React.ComponentProps<typeof V3Table>) => (
  <V3Table containerClassName={cn("border-0", containerClassName)} {...props} />
);

export const EmptyState = ({
  title,
  icon,
  className
}: {
  title: string;
  icon?: IconDefinition;
  className?: string;
}) => (
  <Empty className={cn("border-0", className)}>
    <EmptyHeader>
      {icon && (
        <EmptyMedia variant="icon">
          <FontAwesomeIcon icon={icon} />
        </EmptyMedia>
      )}
      <EmptyTitle>{title}</EmptyTitle>
    </EmptyHeader>
  </Empty>
);

export const TableSkeleton = ({
  columns,
  innerKey,
  rows = 5
}: {
  columns: number;
  innerKey: string;
  rows?: number;
}) => (
  <>
    {SKELETON_ROWS.slice(0, rows).map((row) => (
      <TableRow key={`${innerKey}-skeleton-${row}`}>
        {SKELETON_COLUMNS.slice(0, columns).map((column) => (
          <TableCell key={`${innerKey}-skeleton-${row}-${column}`}>
            <Skeleton className="h-5 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

export {
  TableBody as TBody,
  TableCell as Td,
  TableHead as Th,
  TableHeader as THead,
  TableRow as Tr
};
