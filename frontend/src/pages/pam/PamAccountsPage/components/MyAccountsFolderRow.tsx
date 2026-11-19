import { FolderKey } from "lucide-react";

import { RowLink, TableCell, TableRow } from "@app/components/v3";
import { useOrganization } from "@app/context";

type Props = {
  accountCount?: number;
};

export const MyAccountsFolderRow = ({ accountCount }: Props) => {
  const { currentOrg } = useOrganization();

  return (
    <TableRow linked>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <FolderKey className="size-5 shrink-0 text-product-pam" />
          <RowLink
            to="/organizations/$orgId/pam/accounts/my-accounts"
            params={{ orgId: currentOrg.id }}
            className="shrink-0 font-medium text-foreground"
          >
            My Accounts
          </RowLink>
          {accountCount !== undefined && (
            <span className="shrink-0 text-xs text-muted">({accountCount})</span>
          )}
          <span className="max-w-md truncate text-muted">Accounts you can launch sessions on</span>
        </div>
      </TableCell>
      <TableCell className="w-20" />
    </TableRow>
  );
};
