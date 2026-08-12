import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { ProjectType } from "@app/hooks/api/projects/types";

import { cn } from "../../utils";
import { InstanceIcon, OrgIcon, ProjectIcon, SubOrgIcon } from "../ScopeIcons";

export type TPageHeaderScope = "org" | "namespace" | "instance" | ProjectType | null;

export type TPageHeaderProps = Omit<ComponentProps<"header">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  scope: TPageHeaderScope;
  icon?: LucideIcon;
};

type TPageHeaderScopeConfig = {
  icon: LucideIcon;
  iconClassName: string;
  titleClassName: string;
};

const PAGE_HEADER_SCOPE_CONFIG: Record<NonNullable<TPageHeaderScope>, TPageHeaderScopeConfig> = {
  org: {
    icon: OrgIcon,
    iconClassName: "text-org",
    titleClassName: "decoration-org/90"
  },
  namespace: {
    icon: SubOrgIcon,
    iconClassName: "text-sub-org",
    titleClassName: "decoration-sub-org/90"
  },
  instance: {
    icon: InstanceIcon,
    iconClassName: "text-neutral",
    titleClassName: "decoration-neutral/90"
  },
  [ProjectType.SecretManager]: {
    icon: ProjectIcon,
    iconClassName: "text-project",
    titleClassName: "decoration-project/90"
  },
  [ProjectType.CertificateManager]: {
    icon: ProjectIcon,
    iconClassName: "text-project",
    titleClassName: "decoration-project/90"
  },
  [ProjectType.KMS]: {
    icon: ProjectIcon,
    iconClassName: "text-project",
    titleClassName: "decoration-project/90"
  },
  [ProjectType.SecretScanning]: {
    icon: ProjectIcon,
    iconClassName: "text-project",
    titleClassName: "decoration-project/90"
  },
  [ProjectType.PAM]: {
    icon: ProjectIcon,
    iconClassName: "text-product-pam",
    titleClassName: "decoration-product-pam/90"
  },
  [ProjectType.Sandbox]: {
    icon: ProjectIcon,
    iconClassName: "sandbox-chrome-icon",
    titleClassName: "decoration-product-sandbox/90"
  }
};

export const PageHeader = ({
  title,
  description,
  children,
  className,
  scope,
  icon,
  ...props
}: TPageHeaderProps) => {
  const scopeConfig = scope ? PAGE_HEADER_SCOPE_CONFIG[scope] : null;
  const ResolvedIcon = icon ?? scopeConfig?.icon;

  return (
    <header data-slot="page-header" className={cn("mb-10 w-full", className)} {...props}>
      <div data-slot="page-header-row" className="flex w-full justify-between">
        <div className="mr-4 flex min-w-0 flex-1 items-center">
          <h1
            data-slot="page-header-title"
            className={cn(
              "truncate text-2xl font-medium text-foreground underline underline-offset-4",
              scopeConfig?.titleClassName ?? "no-underline"
            )}
          >
            {ResolvedIcon && (
              <ResolvedIcon
                aria-hidden
                focusable="false"
                size={26}
                className={cn("mr-3 mb-1 inline-block", scopeConfig?.iconClassName)}
              />
            )}
            {title}
          </h1>
        </div>
        <div data-slot="page-header-actions" className="flex items-center gap-2">
          {children}
        </div>
      </div>
      {description && (
        <div data-slot="page-header-description" className="mt-1.5 text-label">
          {description}
        </div>
      )}
    </header>
  );
};
