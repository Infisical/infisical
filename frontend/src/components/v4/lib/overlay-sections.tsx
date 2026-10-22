import * as React from "react";

type SectionTypes = {
  header: React.ElementType;
  subheader?: React.ElementType;
  body?: React.ElementType;
  footer: React.ElementType;
};

/**
 * Splits overlay children into the shared scroll model: an optional pinned group (everything up to
 * the last subheader), one scroll region and the footers. Returns null when no section slot is a
 * direct child, so free-form content (a Sidebar in a Sheet, a command palette) renders untouched.
 */
export const splitOverlaySections = (children: React.ReactNode, types: SectionTypes) => {
  const parts = React.Children.toArray(children);
  const is = (child: React.ReactNode, type?: React.ElementType) =>
    type !== undefined && React.isValidElement(child) && child.type === type;
  const slots = [types.header, types.subheader, types.body, types.footer];
  if (!parts.some((child) => slots.some((type) => is(child, type)))) return null;
  const rest = parts.filter((child) => !is(child, types.footer));
  const pinnedCount = rest.reduce<number>(
    (count, child, index) => (is(child, types.subheader) ? index + 1 : count),
    0
  );
  return {
    pinned: rest.slice(0, pinnedCount),
    scroll: rest.slice(pinnedCount),
    footer: parts.filter((child) => is(child, types.footer))
  };
};
