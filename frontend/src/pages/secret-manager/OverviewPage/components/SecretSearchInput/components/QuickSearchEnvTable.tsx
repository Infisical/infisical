import { ReactNode } from "react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@app/components/v3";

type Props = {
  envName: string;
  // trailing header cell; defaults to the empty actions column used by the deep-search results
  trailingHead?: ReactNode;
  children: ReactNode;
};

export const QuickSearchEnvTable = ({ envName, trailingHead, children }: Props) => (
  <div>
    <h3 className="mb-2 text-sm font-medium text-foreground">{envName}</h3>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead className="w-2/5 min-w-60">Name</TableHead>
          <TableHead className="w-1/4 min-w-36">Location</TableHead>
          {trailingHead ?? <TableHead className="w-24" />}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  </div>
);
