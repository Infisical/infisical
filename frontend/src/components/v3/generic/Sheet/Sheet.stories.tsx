import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Button } from "../Button/Button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "./Sheet";

const meta = {
  title: "Generic/Sheet",
  component: Sheet,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    open: {
      control: "boolean"
    }
  },
  args: { onOpenChange: fn() }
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RightSide: Story = {
  name: "Side: Right (Default)",
  args: {
    children: (
      <>
        <SheetTrigger asChild>
          <Button>Open Sheet</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>
              This is a description of the sheet. It provides context about what the user can do
              here.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">Sheet content goes here.</div>
          <SheetFooter>
            <Button isFullWidth>Save Changes</Button>
            <SheetClose asChild>
              <Button isFullWidth variant="accent">
                Cancel
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </>
    )
  }
};

export const LeftSide: Story = {
  name: "Side: Left",
  args: {
    children: (
      <>
        <SheetTrigger asChild>
          <Button>Open Sheet (Left)</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Navigate through different sections.</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <nav className="flex flex-col gap-2">
              <a href="#" className="text-sm hover:underline">
                Dashboard
              </a>
              <a href="#" className="text-sm hover:underline">
                Settings
              </a>
              <a href="#" className="text-sm hover:underline">
                Profile
              </a>
            </nav>
          </div>
        </SheetContent>
      </>
    )
  }
};

export const TopSide: Story = {
  name: "Side: Top",
  args: {
    children: (
      <>
        <SheetTrigger asChild>
          <Button>Open Sheet (Top)</Button>
        </SheetTrigger>
        <SheetContent side="top">
          <SheetHeader>
            <SheetTitle>Notification</SheetTitle>
            <SheetDescription>You have new notifications.</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <p className="text-sm">This sheet slides in from the top.</p>
          </div>
        </SheetContent>
      </>
    )
  }
};

export const BottomSide: Story = {
  name: "Side: Bottom",
  args: {
    children: (
      <>
        <SheetTrigger asChild>
          <Button>Open Sheet (Bottom)</Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Quick Actions</SheetTitle>
            <SheetDescription>Perform quick actions from here.</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <p className="text-sm">This sheet slides in from the bottom.</p>
          </div>
        </SheetContent>
      </>
    )
  }
};

export const WithForm: Story = {
  name: "Example: With Form",
  args: {
    children: (
      <>
        <SheetTrigger asChild>
          <Button>Edit Profile</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Profile</SheetTitle>
            <SheetDescription>
              Make changes to your profile here. Click save when you&apos;re done.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
                <input
                  id="name"
                  defaultValue="John Doe"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
                <input
                  id="email"
                  type="email"
                  defaultValue="john@example.com"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
          <SheetFooter>
            <Button isFullWidth>Save Changes</Button>
            <SheetClose asChild>
              <Button variant="accent" isFullWidth>
                Cancel
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </>
    )
  }
};

export const WithLongContent: Story = {
  name: "Example: With Long Content",
  args: {
    children: (
      <>
        <SheetTrigger asChild>
          <Button>View Details</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Terms and Conditions</SheetTitle>
            <SheetDescription>Please read our terms carefully.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <p key={`terms-${i + 1}`} className="mb-4 text-sm">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua.
              </p>
            ))}
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button isFullWidth>I Agree</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </>
    )
  }
};

export const Controlled: Story = {
  name: "Example: Controlled",
  args: {
    open: false,
    children: (
      <>
        <SheetTrigger asChild>
          <Button>Controlled Sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Controlled Sheet</SheetTitle>
            <SheetDescription>
              This sheet&apos;s open state is controlled externally via the open prop.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <p className="text-sm">
              Toggle the &quot;open&quot; control in Storybook to open/close this sheet.
            </p>
          </div>
        </SheetContent>
      </>
    )
  }
};
