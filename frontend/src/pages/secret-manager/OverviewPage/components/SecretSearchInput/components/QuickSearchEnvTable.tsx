import { ReactNode } from "react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@app/components/v3";

type Props = {
  envName: string;
  children: ReactNode;
};

export const QuickSearchEnvTable = ({ envName, children }: Props) => (
  <div>
    <h3 className="mb-2 text-sm font-medium text-foreground">{envName}</h3>
    <Table className="[&_td:first-child]:w-10 [&_td:first-child]:max-w-10 [&_td:first-child]:min-w-10 [&_td:first-child]:px-2 [&_th:first-child]:w-10 [&_th:first-child]:max-w-10 [&_th:first-child]:min-w-10 [&_th:first-child]:px-2">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead className="min-w-60">Name</TableHead>
          <TableHead className="min-w-36">Location</TableHead>
          <TableHead className="min-w-56">Metadata</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  </div>
);
