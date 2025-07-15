/* eslint-disable react/prop-types */
import React from "react";
import { faCaretDown, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, ReactNode } from "@tanstack/react-router";
import { LinkComponentProps } from "node_modules/@tanstack/react-router/dist/esm/link";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "../Dropdown";

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & {
    separator?: React.ReactNode;
  }
>(({ ...props }, ref) => <nav ref={ref} aria-label="breadcrumb" {...props} />);
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentPropsWithoutRef<"ol">>(
  ({ className, ...props }, ref) => (
    <ol
      ref={ref}
      className={twMerge(
        "flex flex-wrap items-center break-words text-sm text-bunker-100",
        className
      )}
      {...props}
    />
  )
);
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      className={twMerge("inline-flex items-center gap-1.5 text-sm", className)}
      {...props}
    />
  )
);
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & {
    asChild?: boolean;
  }
>(({ asChild, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={twMerge("transition-colors hover:text-primary", className)}
      {...props}
    />
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={twMerge("font-normal text-bunker-200 last:text-bunker-300", className)}
      {...props}
    />
  )
);
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = ({ children, className, ...props }: React.ComponentProps<"li">) => (
  <li role="presentation" aria-hidden="true" className={twMerge("", className)} {...props}>
    {children ?? <p className="px-3 text-lg text-mineshaft-400/70">/</p>}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={twMerge("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
    <span className="sr-only">More</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbElipssis";

enum BreadcrumbTypes {
  Dropdown = "dropdown",
  Component = "component"
}

export type TBreadcrumbFormat =
  | {
      type: BreadcrumbTypes.Dropdown;
      label: string;
      dropdownTitle?: string;
      links: { label: string; link: LinkComponentProps }[];
    }
  | {
      type: BreadcrumbTypes.Component;
      component: ReactNode;
    }
  | {
      type: undefined;
      link?: LinkComponentProps;
      label: string;
      icon?: ReactNode;
    };

const BreadcrumbContainer = ({ breadcrumbs }: { breadcrumbs: TBreadcrumbFormat[] }) => (
  <div className="mx-auto max-w-7xl text-white">
    <Breadcrumb>
      <BreadcrumbList>
        {(breadcrumbs as TBreadcrumbFormat[]).map((el, index) => {
          const isNotLastCrumb = index + 1 !== breadcrumbs.length;
          const BreadcrumbSegment = isNotLastCrumb ? BreadcrumbLink : BreadcrumbPage;

          if (el.type === BreadcrumbTypes.Dropdown) {
            return (
              <React.Fragment key={`breadcrumb-group-${index + 1}`}>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <BreadcrumbItem>
                      <BreadcrumbSegment className="rounded-md py-1 py-2">
                        {el.label}{" "}
                        <FontAwesomeIcon
                          icon={faCaretDown}
                          size="sm"
                          className="ml-2 text-bunker-300"
                        />
                      </BreadcrumbSegment>
                    </BreadcrumbItem>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" sideOffset={8} align="start">
                    {el?.dropdownTitle && <DropdownMenuLabel>{el.dropdownTitle}</DropdownMenuLabel>}
                    {el.links.map((i, dropIndex) => (
                      <Link
                        {...i.link}
                        key={`breadcrumb-group-${index + 1}-dropdown-${dropIndex + 1}`}
                      >
                        <DropdownMenuItem>{i.label}</DropdownMenuItem>
                      </Link>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {isNotLastCrumb && <BreadcrumbSeparator />}
              </React.Fragment>
            );
          }

          if (el.type === BreadcrumbTypes.Component) {
            const Component = el.component;
            return (
              <React.Fragment key={`breadcrumb-group-${index + 1}`}>
                <BreadcrumbItem>
                  <BreadcrumbSegment>
                    <Component />
                  </BreadcrumbSegment>
                </BreadcrumbItem>
                {isNotLastCrumb && <BreadcrumbSeparator />}
              </React.Fragment>
            );
          }

          const Icon = el?.icon;
          return (
            <React.Fragment key={`breadcrumb-group-${index + 1}`}>
              {"link" in el && isNotLastCrumb ? (
                <Link {...el.link}>
                  <BreadcrumbItem>
                    <BreadcrumbLink className="inline-flex items-center gap-1.5">
                      {Icon && <Icon />}
                      {el.label}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </Link>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbPage className="inline-flex items-center gap-1.5">
                    {Icon && <Icon />}
                    {el.label}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              )}
              {isNotLastCrumb && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  </div>
);

export {
  Breadcrumb,
  BreadcrumbContainer,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbTypes
};
