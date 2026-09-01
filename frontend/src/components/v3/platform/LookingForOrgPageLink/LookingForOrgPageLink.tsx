import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { useOrganization } from "@app/context";

import { Button } from "../../generic";
import { cn } from "../../utils";

const ORG_PAGE_CONFIG = {
  settings: {
    to: "/organizations/$orgId/settings",
    label: "settings"
  },
  accessControl: {
    to: "/organizations/$orgId/access-management",
    label: "access control"
  },
  auditLogs: {
    to: "/organizations/$orgId/audit-logs",
    label: "audit logs"
  }
} as const;

export type TLookingForOrgPageLinkProps = {
  page: keyof typeof ORG_PAGE_CONFIG;
  target?: "current" | "root";
  className?: string;
};

export const LookingForOrgPageLink = ({
  page,
  target = "current",
  className
}: TLookingForOrgPageLinkProps) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const { to, label } = ORG_PAGE_CONFIG[page];

  if (target === "root" && !isSubOrganization) {
    return null;
  }

  const orgId = target === "root" ? (currentOrg.rootOrgId ?? "") : currentOrg.id;
  const scopeLabel = target === "root" ? "root org" : `${isSubOrganization ? "sub-" : ""}org`;
  const text = `${scopeLabel} ${label}`;

  return (
    <Button variant="ghost" size="sm" asChild className={cn("text-muted", className)}>
      <Link to={to} params={{ orgId }}>
        {text.charAt(0).toUpperCase() + text.slice(1)}
        <ChevronRightIcon aria-hidden />
      </Link>
    </Button>
  );
};
