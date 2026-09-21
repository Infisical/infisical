import type { LucideIcon } from "lucide-react";

import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  TableCell,
  TableRow
} from "@app/components/v3";

const SKELETON_ROWS = ["one", "two", "three", "four", "five"];
const SKELETON_COLUMNS = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

export const V3TableSkeleton = ({
  columns,
  name,
  rows = 5
}: {
  columns: number;
  name: string;
  rows?: number;
}) => (
  <>
    {SKELETON_ROWS.slice(0, rows).map((row) => (
      <TableRow key={`${name}-skeleton-${row}`}>
        {SKELETON_COLUMNS.slice(0, columns).map((column) => (
          <TableCell key={`${name}-skeleton-${row}-${column}`}>
            <Skeleton className="h-5 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

export const V3TableEmptyState = ({ title, icon: Icon }: { title: string; icon: LucideIcon }) => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
    </EmptyHeader>
  </Empty>
);
