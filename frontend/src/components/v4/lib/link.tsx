import * as React from "react";

/**
 * Augment this interface to type the link target every Cipher component takes, for example
 * `interface CipherRegister { link: LinkOptions }` for a TanStack Router app. A target with
 * `disabled: true` renders RowLink and CardLink as unavailable.
 */
// oxlint-disable-next-line typescript/no-empty-object-type
export interface CipherRegister {}

export type CipherLinkTarget = CipherRegister extends { link: infer Target }
  ? Target
  : { href: string };

export type CipherLinkProps = Omit<React.ComponentPropsWithoutRef<"a">, "href"> & {
  link: CipherLinkTarget;
  ref?: React.Ref<HTMLAnchorElement>;
};

export type CipherLinkMatch = { exact: boolean; length: number };

export type CipherRouter = {
  /** Renders an anchor for a link target, passing every other prop and the ref to it. */
  Link: React.ComponentType<CipherLinkProps>;
  /** A hook that returns how a link target matches the current location, or undefined when it does not. */
  useLinkMatch: () => (link: CipherLinkTarget) => CipherLinkMatch | undefined;
};

const PlainLink = ({ link, ref, children, ...props }: CipherLinkProps) => (
  <a ref={ref} href={(link as { href?: string }).href} {...props}>
    {children}
  </a>
);

const noMatch = () => undefined;

const CipherRouterContext = React.createContext<CipherRouter>({
  Link: PlainLink,
  useLinkMatch: () => noMatch
});

/** Wires the app's router into Cipher once, at the root; without it links render plain anchors. */
export function CipherRouterProvider({
  router,
  children
}: {
  router: CipherRouter;
  children: React.ReactNode;
}) {
  return <CipherRouterContext value={router}>{children}</CipherRouterContext>;
}

export function CipherLink(props: CipherLinkProps) {
  const { Link } = React.use(CipherRouterContext);
  return <Link {...props} />;
}

export const useCipherLinkMatch = () => React.use(CipherRouterContext).useLinkMatch();
