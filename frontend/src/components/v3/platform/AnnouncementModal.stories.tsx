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
