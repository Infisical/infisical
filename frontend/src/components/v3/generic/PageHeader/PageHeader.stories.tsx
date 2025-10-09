import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderIcon, SettingsIcon, PlusIcon } from "lucide-react";

import { Button } from "../Button";
import { Badge } from "../Badge";
import { PageHeader, PageHeaderTitle, PageHeaderDescription, PageHeaderMedia } from "./PageHeader";

const meta = {
  title: "Generic/PageHeader",
  component: PageHeader,
  parameters: {
    layout: "padded"
  },
  tags: ["autodocs"],
  args: {
    children: (
      <>
        <PageHeaderTitle>Page Title</PageHeaderTitle>
        <PageHeaderDescription>This is a page description.</PageHeaderDescription>
      </>
    )
  }
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default"
};

export const WithMediumTitle: Story = {
  name: "Size: Medium Title",
  args: {
    children: (
      <>
        <PageHeaderTitle size="md">Medium Page Title</PageHeaderTitle>
        <PageHeaderDescription>
          This is a page description with a medium title.
        </PageHeaderDescription>
      </>
    )
  }
};

export const WithLargeTitle: Story = {
  name: "Size: Large Title",
  args: {
    children: (
      <>
        <PageHeaderTitle size="lg">Large Page Title</PageHeaderTitle>
        <PageHeaderDescription>
          This is a page description with a large title.
        </PageHeaderDescription>
      </>
    )
  }
};

export const TitleOnly: Story = {
  name: "Example: Title Only",
  args: {
    children: <PageHeaderTitle size="lg">Page Title</PageHeaderTitle>
  }
};

export const WithIcon: Story = {
  name: "Example: With Icon",
  args: {
    children: (
      <>
        <PageHeaderTitle size="lg">
          <PageHeaderMedia>
            <SettingsIcon />
          </PageHeaderMedia>
          Settings
        </PageHeaderTitle>
        <PageHeaderDescription>Manage your application settings</PageHeaderDescription>
      </>
    )
  }
};

export const WithImage: Story = {
  name: "Example: With Image",
  args: {
    className: "flex items-center gap-3",
    children: (
      <>
        <PageHeaderMedia variant="image">
          <img src="https://picsum.photos/40" alt="Project" />
        </PageHeaderMedia>
        <div className="flex flex-col gap-1">
          <PageHeaderTitle size="lg">Project Dashboard</PageHeaderTitle>
          <PageHeaderDescription>Overview of your project</PageHeaderDescription>
        </div>
      </>
    )
  }
};

export const WithBadge: Story = {
  name: "Example: With Badge",
  args: {
    children: (
      <>
        <PageHeaderTitle size="lg" className="flex items-center gap-2">
          Feature Preview
          <Badge variant="info">Beta</Badge>
        </PageHeaderTitle>
        <PageHeaderDescription>
          This feature is currently in beta. Please report any issues.
        </PageHeaderDescription>
      </>
    )
  }
};

export const WithActions: Story = {
  name: "Example: With Actions",
  render: () => (
    <PageHeader className="flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <PageHeaderTitle size="lg">Projects</PageHeaderTitle>
        <PageHeaderDescription>Manage your projects and teams</PageHeaderDescription>
      </div>
      <Button>
        <PlusIcon />
        New Project
      </Button>
    </PageHeader>
  )
};

export const WithIconAndActions: Story = {
  name: "Example: With Icon and Actions",
  render: () => (
    <PageHeader className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <PageHeaderMedia variant="icon">
          <FolderIcon />
        </PageHeaderMedia>
        <div className="flex flex-col gap-1">
          <PageHeaderTitle size="lg">Documents</PageHeaderTitle>
          <PageHeaderDescription>Browse and manage your documents</PageHeaderDescription>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline">Import</Button>
        <Button>
          <PlusIcon />
          New Document
        </Button>
      </div>
    </PageHeader>
  )
};

export const CompactLayout: Story = {
  name: "Example: Compact Layout",
  args: {
    className: "flex items-center justify-between",
    children: (
      <>
        <PageHeaderTitle size="md">Dashboard</PageHeaderTitle>
        <Button variant="outline" size="sm">
          <SettingsIcon />
          Settings
        </Button>
      </>
    )
  }
};

export const MultilineDescription: Story = {
  name: "Example: Multiline Description",
  args: {
    children: (
      <>
        <PageHeaderTitle size="lg">Getting Started</PageHeaderTitle>
        <PageHeaderDescription>
          Welcome to the application! Follow the steps below to set up your account and start using
          all the features. If you need help at any point, you can access our documentation or
          contact support.
        </PageHeaderDescription>
      </>
    )
  }
};
