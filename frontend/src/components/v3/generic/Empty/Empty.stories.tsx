import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DatabaseIcon,
  FolderIcon,
  InboxIcon,
  SearchIcon,
  UsersIcon,
  FileTextIcon
} from "lucide-react";

import { Button } from "../Button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "./Empty";

const meta = {
  title: "Generic/EmptyState",
  component: Empty,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  decorators: (Story: any) => {
    return (
      <div className="flex w-[600px] justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>No items found</EmptyTitle>
        <EmptyDescription>Get started by creating your first item.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Create Item</Button>
      </EmptyContent>
    </Empty>
  )
};

export const WithIconVariant: Story = {
  name: "With Icon Variant",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <DatabaseIcon />
        </EmptyMedia>
        <EmptyTitle>No database connections</EmptyTitle>
        <EmptyDescription>
          Connect your first database to get started with data management.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Add Database</Button>
      </EmptyContent>
    </Empty>
  )
};

export const SearchNoResults: Story = {
  name: "Search No Results",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>No results found</EmptyTitle>
        <EmptyDescription>
          We couldn't find any results matching your search. Try adjusting your search terms.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">Clear Search</Button>
      </EmptyContent>
    </Empty>
  )
};

export const NoUsers: Story = {
  name: "No Users",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>No team members yet</EmptyTitle>
        <EmptyDescription>Invite team members to collaborate on this project.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button>Invite Members</Button>
          <Button variant="outline">Copy Invite Link</Button>
        </div>
      </EmptyContent>
    </Empty>
  )
};

export const NoDocuments: Story = {
  name: "No Documents",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon />
        </EmptyMedia>
        <EmptyTitle>No documents</EmptyTitle>
        <EmptyDescription>
          You haven't created any documents yet. Create your first document to get started.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>New Document</Button>
      </EmptyContent>
    </Empty>
  )
};

export const EmptyFolder: Story = {
  name: "Empty Folder",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderIcon />
        </EmptyMedia>
        <EmptyTitle>This folder is empty</EmptyTitle>
        <EmptyDescription>
          Upload files or create new folders to organize your content.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button>Upload Files</Button>
          <Button variant="outline">New Folder</Button>
        </div>
      </EmptyContent>
    </Empty>
  )
};

export const WithLink: Story = {
  name: "With Link",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon />
        </EmptyMedia>
        <EmptyTitle>No API keys</EmptyTitle>
        <EmptyDescription>
          Create an API key to authenticate your requests.{" "}
          <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">
            Learn more
          </a>
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Generate API Key</Button>
      </EmptyContent>
    </Empty>
  )
};

export const MinimalWithoutActions: Story = {
  name: "Minimal Without Actions",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing to display</EmptyTitle>
        <EmptyDescription>There are no items to show at this time.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
};

export const OnlyTitle: Story = {
  name: "Only Title",
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyTitle>No data available</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
};

export const CustomStyling: Story = {
  name: "Custom Styling",
  render: (args) => (
    <Empty {...args} className="border-2 bg-accent/10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <DatabaseIcon />
        </EmptyMedia>
        <EmptyTitle className="text-xl">Welcome to your dashboard</EmptyTitle>
        <EmptyDescription className="text-base">
          This is where you'll see your analytics and insights once you start collecting data.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="lg">Get Started</Button>
      </EmptyContent>
    </Empty>
  )
};
