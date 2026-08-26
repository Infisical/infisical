import { Link } from "@tanstack/react-router";
import { FolderIcon, SlashIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@app/components/v3";

type Props = {
  orgId: string;
  // Omitted at the root, where the folder icon is the current location.
  folderName?: string;
};

export const AccountsBreadcrumb = ({ orgId, folderName }: Props) => (
  <Breadcrumb className="ml-1.5 min-w-0">
    <BreadcrumbList className="flex-nowrap">
      <BreadcrumbItem>
        <BreadcrumbLink asChild className="text-muted hover:text-foreground hover:no-underline">
          <Link to="/organizations/$orgId/pam/accounts" params={{ orgId }} aria-label="All folders">
            <FolderIcon />
          </Link>
        </BreadcrumbLink>
      </BreadcrumbItem>
      {folderName && (
        <>
          <BreadcrumbSeparator>
            <SlashIcon className="size-3 -rotate-12" />
          </BreadcrumbSeparator>
          <BreadcrumbPage title={folderName} className="truncate">
            {folderName}
          </BreadcrumbPage>
        </>
      )}
    </BreadcrumbList>
  </Breadcrumb>
);
