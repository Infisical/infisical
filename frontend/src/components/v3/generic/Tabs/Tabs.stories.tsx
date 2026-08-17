import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "../Button";
import { Card, CardContent } from "../Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";

const meta = {
  title: "Generic/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = {
  parameters: {
    docs: {
      description: {
        story: "The active tab uses a background treatment rather than a bordered trigger."
      }
    }
  },
  render: () => (
    <Tabs defaultValue="overview" className="w-[360px]">
      <TabsList aria-label="Filled sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">A short overview of the current resource.</TabsContent>
      <TabsContent value="activity">Recent activity for the current resource.</TabsContent>
      <TabsContent value="settings">Settings for the current resource.</TabsContent>
    </Tabs>
  )
};

const scopeVariants = ["project", "org", "sub-org", "pam"] as const;

function ScopeVariantTabs({ variant }: { variant: (typeof scopeVariants)[number] }) {
  return (
    <Tabs defaultValue="overview" className="w-[260px]">
      <TabsList variant={variant} aria-label={`${variant} sections`}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview content.</TabsContent>
      <TabsContent value="activity">Activity content.</TabsContent>
    </Tabs>
  );
}

export const ScopeVariants: Story = {
  parameters: {
    docs: {
      description: {
        story: "The underline variants use their semantic scope colors for the active tab."
      }
    }
  },
  render: () => (
    <div className="flex flex-col gap-5">
      {scopeVariants.map((variant) => (
        <ScopeVariantTabs key={variant} variant={variant} />
      ))}
    </div>
  )
};

export const HorizontalOverflow: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A narrow tab list scrolls horizontally, and keyboard navigation can reach the final tab."
      }
    }
  },
  render: () => (
    <Tabs defaultValue="overview" className="w-96 max-w-full">
      <TabsList variant="project" aria-label="Project sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="audit">Audit logs</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="release">Release history</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview content.</TabsContent>
      <TabsContent value="members">Members content.</TabsContent>
      <TabsContent value="integrations">Integrations content.</TabsContent>
      <TabsContent value="audit">Audit content.</TabsContent>
      <TabsContent value="settings">Settings content.</TabsContent>
      <TabsContent value="release">Release history content.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("tablist", { name: "Project sections" });
    const firstTab = canvas.getByRole("tab", { name: "Overview" });
    const finalTab = canvas.getByRole("tab", { name: "Release history" });

    await userEvent.click(firstTab);
    await userEvent.keyboard("{End}");

    await expect(finalTab).toHaveFocus();
    await expect(finalTab).toHaveAttribute("data-state", "active");
    await expect(finalTab.getBoundingClientRect().right).toBeLessThanOrEqual(
      list.getBoundingClientRect().right + 1
    );
  }
};

function ControlledRender() {
  const [value, setValue] = useState("overview");

  return (
    <div className="flex w-96 max-w-full flex-col gap-3">
      <Tabs value={value} onValueChange={setValue}>
        <TabsList variant="project" aria-label="Controlled sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="release">Release history</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content.</TabsContent>
        <TabsContent value="activity">Activity content.</TabsContent>
        <TabsContent value="members">Members content.</TabsContent>
        <TabsContent value="settings">Settings content.</TabsContent>
        <TabsContent value="release">Release history content.</TabsContent>
      </Tabs>
      <Button variant="outline" size="sm" onClick={() => setValue("release")}>
        Select final tab
      </Button>
    </div>
  );
}

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story: "Selecting the off-screen tab externally reveals the active trigger."
      }
    }
  },
  render: () => <ControlledRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("tablist", { name: "Controlled sections" });
    const finalTab = canvas.getByRole("tab", { name: "Release history" });

    await userEvent.click(canvas.getByRole("button", { name: "Select final tab" }));

    await expect(finalTab).toHaveAttribute("data-state", "active");
    await expect(finalTab.getBoundingClientRect().right).toBeLessThanOrEqual(
      list.getBoundingClientRect().right + 1
    );
  }
};

export const ManualActivation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "With manual activation, arrow keys move focus and Enter or Space activates the focused tab."
      }
    }
  },
  render: () => (
    <Tabs defaultValue="overview" activationMode="manual" className="w-[360px]">
      <TabsList aria-label="Manual sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview content.</TabsContent>
      <TabsContent value="activity">Activity content.</TabsContent>
      <TabsContent value="settings">Settings content.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overviewTab = canvas.getByRole("tab", { name: "Overview" });
    const activityTab = canvas.getByRole("tab", { name: "Activity" });

    await userEvent.click(overviewTab);
    await userEvent.keyboard("{ArrowRight}");

    await expect(activityTab).toHaveFocus();
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await expect(activityTab).toHaveAttribute("aria-selected", "false");

    await userEvent.keyboard("{Enter}");
    await expect(activityTab).toHaveAttribute("aria-selected", "true");
  }
};

export const Disabled: Story = {
  parameters: {
    docs: {
      description: {
        story: "The disabled tab cannot be focused or activated by keyboard or pointer interaction."
      }
    }
  },
  render: () => (
    <Tabs defaultValue="overview" className="w-[360px]">
      <TabsList aria-label="Sections with an unavailable tab">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="unavailable" disabled>
          Unavailable
        </TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview content.</TabsContent>
      <TabsContent value="unavailable">Unavailable content.</TabsContent>
      <TabsContent value="settings">Settings content.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overviewTab = canvas.getByRole("tab", { name: "Overview" });
    const settingsTab = canvas.getByRole("tab", { name: "Settings" });

    await userEvent.click(overviewTab);
    await userEvent.keyboard("{ArrowRight}");

    await expect(settingsTab).toHaveFocus();
    await expect(settingsTab).toHaveAttribute("aria-selected", "true");
  }
};

export const Vertical: Story = {
  render: () => (
    <Tabs orientation="vertical" defaultValue="overview" className="w-[320px] flex-row">
      <TabsList variant="project" aria-label="Vertical sections" className="w-28">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview content.</TabsContent>
      <TabsContent value="activity">Activity content.</TabsContent>
      <TabsContent value="settings">Settings content.</TabsContent>
    </Tabs>
  )
};

export const InCard: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardContent>
        <Tabs defaultValue="summary">
          <TabsList aria-label="Card sections">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="summary">A concise summary of this resource.</TabsContent>
          <TabsContent value="history">A concise history of this resource.</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
};
