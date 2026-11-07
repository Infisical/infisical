import * as React from "react";

type OverlayForm = React.ReactElement<React.ComponentProps<"form"> & { "data-slot"?: string }>;

type SectionTypes = {
  header: React.ElementType;
  subheader?: React.ElementType;
  body?: React.ElementType;
  footer: React.ElementType;
};

const flattenFragments = (children: React.ReactNode, prefix = ""): React.ReactNode[] =>
  React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement(child) && child.type === React.Fragment)
      return flattenFragments(
        (child.props as { children?: React.ReactNode }).children,
        `${prefix}${child.key}`
      );
    return React.isValidElement(child) && prefix
      ? [React.cloneElement(child, { key: `${prefix}${child.key}` })]
      : [child];
  });

/**
 * Splits overlay children into the shared scroll model: an optional pinned group (everything up to
 * the last subheader, or the last header too with pinHeader), one scroll region and the footers.
 * Fragments are unwrapped, so slots rendered behind a condition still count as direct children.
 * Returns null when no section slot is a direct child, so free-form content (a Sidebar in a Sheet, a
 * command palette) renders untouched. With lookThroughForm, a <form> that is the only child is looked
 * through: its children are split instead, and the result returns the form so Content renders the
 * sections inside it with display: contents, which keeps the same boxes as without the form.
 */
export const splitOverlaySections = (
  children: React.ReactNode,
  types: SectionTypes,
  {
    pinHeader = false,
    lookThroughForm = false
  }: { pinHeader?: boolean; lookThroughForm?: boolean } = {}
) => {
  const top = flattenFragments(children);
  const [only] = top;
  const form =
    lookThroughForm &&
    top.length === 1 &&
    React.isValidElement<OverlayForm["props"]>(only) &&
    only.type === "form"
      ? (only as OverlayForm)
      : undefined;
  const parts = form ? flattenFragments(form.props.children) : top;
  const is = (child: React.ReactNode, type?: React.ElementType) =>
    type !== undefined && React.isValidElement(child) && child.type === type;
  const slots = [types.header, types.subheader, types.body, types.footer];
  if (!parts.some((child) => slots.some((type) => is(child, type)))) return null;
  const rest = parts.filter((child) => !is(child, types.footer));
  const pinnedCount = rest.reduce<number>(
    (count, child, index) =>
      is(child, types.subheader) || (pinHeader && is(child, types.header)) ? index + 1 : count,
    0
  );
  return {
    pinned: rest.slice(0, pinnedCount),
    scroll: rest.slice(pinnedCount),
    footer: parts.filter((child) => is(child, types.footer)),
    form
  };
};

export const renderInForm = (
  form: OverlayForm | undefined,
  slot: string,
  layout: React.ReactNode
) => (form ? React.cloneElement(form, { "data-slot": slot }, layout) : layout);
