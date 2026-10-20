import { Fragment } from "react";
import { Link, type LinkProps, useRouterState } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@app/components/v3";
import { NavbarBlock } from "@app/layouts/NavbarSwitcher";

export type TNavBreadcrumb = {
  label: string;
  link?: LinkProps;
};

export const useNavBreadcrumbs = () =>
  useRouterState({
    select: (state) => {
      const context = state.matches[state.matches.length - 1]?.context as
        | { breadcrumbs?: TNavBreadcrumb[] }
        | undefined;
      return context?.breadcrumbs ?? [];
    }
  });

export const NavbarPageBreadcrumbs = () => {
  const breadcrumbs = useNavBreadcrumbs();

  if (!breadcrumbs.length) return null;

  return (
    <NavbarBlock className="hidden md:flex">
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="min-w-0 flex-nowrap">
          {breadcrumbs.map((crumb, index) => {
            const isCurrentPage = index === breadcrumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${index + 1}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className="min-w-0">
                  {isCurrentPage && (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  )}
                  {!isCurrentPage && crumb.link && (
                    <BreadcrumbLink asChild className="truncate">
                      <Link {...crumb.link}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                  {!isCurrentPage && !crumb.link && <span className="truncate">{crumb.label}</span>}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </NavbarBlock>
  );
};
