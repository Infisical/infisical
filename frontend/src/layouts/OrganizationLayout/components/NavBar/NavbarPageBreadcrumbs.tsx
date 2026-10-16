import { Fragment } from "react";
import { Link, type LinkProps, useParams, useRouterState } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@app/components/v3";
import { useImplicitProduct } from "@app/hooks";

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
  const params = useParams({ strict: false });
  const implicitProduct = useImplicitProduct();
  const breadcrumbs = useNavBreadcrumbs();

  if ((!params.projectId && !implicitProduct) || !breadcrumbs.length) return null;

  return (
    <Breadcrumb className="hidden h-full min-w-0 items-center border-l border-border-soft pr-2 pl-4 md:flex">
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
  );
};
