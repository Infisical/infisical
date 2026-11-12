import * as React from "react";
import { createLink, type LinkOptions, useMatchRoute, useRouter } from "@tanstack/react-router";

import {
  type CipherLinkProps,
  type CipherRouter,
  CipherRouterProvider
} from "@app/components/v4/lib/link";

declare module "@app/components/v4/lib/link" {
  interface CipherRegister {
    link: LinkOptions;
  }
}

// An element that sets data-current owns its aria-current, so the router's active state cannot override it.
function RouterAnchor({
  ref,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  ref?: React.Ref<HTMLAnchorElement>;
  "data-current"?: boolean;
}) {
  let current = props["aria-current"];
  if ("data-current" in props) current = props["data-current"] ? "page" : undefined;
  return (
    <a ref={ref} {...props} aria-current={current}>
      {children}
    </a>
  );
}

const RouterLink = createLink(RouterAnchor) as unknown as React.ComponentType<
  LinkOptions & React.ComponentPropsWithRef<"a">
>;

const cipherRouter: CipherRouter = {
  Link: ({ link, ...props }: CipherLinkProps) => <RouterLink {...link} {...props} />,
  useLinkMatch: () => {
    const router = useRouter();
    const matchRoute = useMatchRoute();
    return (link) => {
      const target = link as Parameters<typeof matchRoute>[0];
      const exact = Boolean(matchRoute({ ...target, fuzzy: false }));
      if (!exact && (link.activeOptions?.exact || !matchRoute({ ...target, fuzzy: true })))
        return undefined;
      return { exact, length: router.buildLocation(target).pathname.length };
    };
  }
};

/** Wires TanStack Router into every Cipher link and the Sidebar's current-page match. */
export const V4RouterProvider = ({ children }: { children: React.ReactNode }) => (
  <CipherRouterProvider router={cipherRouter}>{children}</CipherRouterProvider>
);
