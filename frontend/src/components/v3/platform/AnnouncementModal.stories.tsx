import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { AnnouncementModal } from "@app/components/announcements/AnnouncementModal";

import { Button } from "../generic/Button";

const meta = {
  title: "Platform/AnnouncementModal",
  component: AnnouncementModal,
  tags: ["autodocs"],
  args: {
    isOpen: true,
    onOpenChange: () => {},
    announcements: [
      {
        id: "short",
        title: "Product Updates",
        body: "Review the latest updates to Infisical.",
        imageUrl:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450'%3E%3Crect width='800' height='450' fill='white'/%3E%3C/svg%3E",
        link: "https://infisical.com",
        linkLabel: "Read More",
        published: "2026-09-10T00:00:00Z"
      },
      {
        id: "long",
        title: "More Updates",
        body: "Long announcement content remains scrollable while navigation stays visible.\n\n".repeat(
          30
        ),
        imageUrl: null,
        link: null,
        linkLabel: null,
        published: "2026-09-09T00:00:00Z"
      },
      {
        id: "unavailable",
        title: "Unavailable Artwork",
        body: "You can still read this announcement and navigate when artwork fails to load.",
        imageUrl: "data:image/png;base64,invalid",
        link: null,
        linkLabel: null,
        published: "2026-09-08T00:00:00Z"
      }
    ]
  }
} satisfies Meta<typeof AnnouncementModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Announcement Navigation",
  parameters: {
    docs: {
      description: {
        story:
          "A navigation bar below the card holds Previous and Next buttons, one dot per announcement, and a step count such as 2 of 3. Next becomes Done on the last announcement and closes the modal. Selecting a dot jumps straight to that announcement. Previews use a fixed 32px offset. Only their artwork and text blur as they recede, then sharpen as they become active; card surfaces and borders stay sharp. Hover or focus a preview to move it outward another 8px and brighten it; select it to navigate. Pointer and arrow-key navigation share the transition; reduced motion disables it. Close it with Done, the top-right button, Escape, or the backdrop. Long content scrolls independently of the controls."
      }
    }
  },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(args.isOpen);

    return (
      <>
        <Button variant="outline" onClick={() => setIsOpen(true)}>
          Open Announcements
        </Button>
        <AnnouncementModal {...args} isOpen={isOpen} onOpenChange={setIsOpen} />
      </>
    );
  }
};

export const SingleAnnouncement: Story = {
  ...Default,
  name: "Example: Single Announcement",
  args: {
    announcements: [meta.args.announcements[0]]
  }
};

export const LongTitle: Story = {
  ...Default,
  name: "State: Long Title",
  args: {
    announcements: [
      {
        ...meta.args.announcements[0],
        title: "New Controls for Managing Secrets Across Your Organization and Projects"
      },
      ...meta.args.announcements.slice(1)
    ]
  }
};
