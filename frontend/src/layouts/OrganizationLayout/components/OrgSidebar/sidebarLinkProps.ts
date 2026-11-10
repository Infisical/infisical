import type { LinkProps } from "@tanstack/react-router";

export type SidebarLinkProps = Pick<LinkProps, "to" | "params" | "search">;

// The sidebar builds paths from nav config at runtime, so the router's literal route types cannot
// be satisfied statically. This is the single place that asserts the shape.
const asLinkProps = (props: {
  to: string;
  params: Record<string, string>;
  search?: Record<string, unknown>;
}) => props as unknown as SidebarLinkProps;

export const orgLinkProps = (
  orgId: string,
  pathSuffix: string,
  search?: Record<string, unknown>
): SidebarLinkProps =>
  asLinkProps({ to: `/organizations/$orgId/${pathSuffix}`, params: { orgId }, search });

export const projectLinkProps = ({
  orgId,
  projectId,
  typePath,
  pathSuffix,
  isOrgScoped,
  search
}: {
  orgId: string;
  projectId: string;
  typePath: string;
  pathSuffix: string;
  isOrgScoped: boolean;
  search?: Record<string, unknown>;
}): SidebarLinkProps =>
  asLinkProps({
    to: isOrgScoped
      ? `/organizations/$orgId/${typePath}/${pathSuffix}`
      : `/organizations/$orgId/projects/${typePath}/$projectId/${pathSuffix}`,
    params: { orgId, projectId },
    search
  });
