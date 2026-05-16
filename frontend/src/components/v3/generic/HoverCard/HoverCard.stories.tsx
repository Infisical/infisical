import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExternalLinkIcon } from "lucide-react";

import { Button } from "../Button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./HoverCard";

/**
 * Reach for `HoverCard` when a hover gesture should reveal a *rich preview* of
 * something the user can already see — a profile chip, a referenced resource,
 * a documentation link. Use `Tooltip` for short label-style hints, `Popover`
 * when the content is interactive and the user clicks to open it.
 *
 * Compose three parts:
 * - `HoverCard` — the root that owns open state. Accepts `openDelay` (default
 *   `700ms`) and `closeDelay` (default `300ms`) to tune how forgiving the
 *   open/close gesture is.
 * - `HoverCardTrigger` — the element being hovered. Pair with `asChild` to
 *   forward props onto an inline link, badge, or button rather than rendering
 *   an extra wrapper.
 * - `HoverCardContent` — the floating panel. Accepts `align`, `side`, and
 *   `sideOffset`, just like `Popover`.
 *
 * **Don't** put interactive controls (form fields, primary actions) inside a
 * hover card — the hover-then-click flow is fragile, and the panel is
 * unreachable on touch devices. If the content needs interaction, use
 * `Popover` instead.
 */
const meta = {
  title: "Generic/HoverCard",
  component: HoverCard,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    openDelay: { control: "number" },
    closeDelay: { control: "number" },
    defaultOpen: { control: "boolean" },
    open: { table: { disable: true } },
    onOpenChange: { table: { disable: true } },
    children: { table: { disable: true } }
  },
  args: { openDelay: 200, closeDelay: 150, defaultOpen: false }
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The canonical pairing — wrap an inline documentation link to show the user where they're about to navigate before they click. Pair with `ExternalLinkIcon` for off-site destinations."
      }
    }
  },
  render: (args) => (
    <p className="max-w-sm text-sm text-foreground">
      See{" "}
      <HoverCard {...args}>
        <HoverCardTrigger asChild>
          <a
            href="https://infisical.com/docs/documentation/platform/sso/overview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
          >
            SSO overview
            <ExternalLinkIcon className="size-3" />
          </a>
        </HoverCardTrigger>
        <HoverCardContent className="w-72" align="start">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">SSO overview</span>
            <p className="text-xs text-muted">
              How Infisical&apos;s SSO works across SAML, OIDC, and Google OAuth — including the
              break-glass admin login portal.
            </p>
            <span className="text-xs text-accent">infisical.com/docs</span>
          </div>
        </HoverCardContent>
      </HoverCard>{" "}
      for the full setup guide.
    </p>
  )
};

export const Alignment: Story = {
  name: "Example: Alignment",
  parameters: {
    docs: {
      description: {
        story:
          "`align` controls horizontal placement relative to the trigger edge — `start`, `center` (default), or `end`. Match the trigger's position in the layout so the panel doesn't push off-screen on narrow viewports."
      }
    }
  },
  render: () => (
    <div className="flex items-center gap-3">
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">align=&quot;start&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent align="start">
          <p className="text-sm">Panel aligned to the trigger&apos;s leading edge.</p>
        </HoverCardContent>
      </HoverCard>
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">align=&quot;center&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent align="center">
          <p className="text-sm">Panel centered on the trigger.</p>
        </HoverCardContent>
      </HoverCard>
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">align=&quot;end&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent align="end">
          <p className="text-sm">Panel aligned to the trigger&apos;s trailing edge.</p>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
};

export const Sides: Story = {
  name: "Example: Sides",
  parameters: {
    docs: {
      description: {
        story:
          "`side` controls which edge of the trigger the panel opens from — `top`, `right`, `bottom` (default), or `left`. Bump `sideOffset` (default `4`) to give the panel breathing room. Radix flips automatically if there isn't space."
      }
    }
  },
  render: () => (
    <div className="grid grid-cols-2 gap-3 p-12">
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">side=&quot;top&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent side="top">
          <p className="text-sm">Opens above the trigger.</p>
        </HoverCardContent>
      </HoverCard>
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">side=&quot;right&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent side="right" sideOffset={8}>
          <p className="text-sm">Opens to the right with `sideOffset={8}`.</p>
        </HoverCardContent>
      </HoverCard>
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">side=&quot;bottom&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom">
          <p className="text-sm">Opens below the trigger (default).</p>
        </HoverCardContent>
      </HoverCard>
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button variant="outline">side=&quot;left&quot;</Button>
        </HoverCardTrigger>
        <HoverCardContent side="left" sideOffset={8}>
          <p className="text-sm">Opens to the left with `sideOffset={8}`.</p>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
};
