import type { Meta, StoryObj } from "@storybook/react-vite";

import { cn } from "../../utils";
import { SECRET_MANAGER_RESOURCE_LIST, type SecretManagerResource } from "./SecretManagerResources";

const Catalog = ({ resources }: { resources: SecretManagerResource[] }) => (
  <ul className="flex w-[36rem] flex-col gap-3">
    {resources.map((resource) => (
      <li
        key={resource.slug}
        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border",
            resource.color.tileClassName
          )}
        >
          <resource.Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">{resource.name}</span>
            <span className="font-mono text-xs text-accent">{resource.slug}</span>
            <span className="font-mono text-xs text-muted">{resource.permissionSubject}</span>
          </div>
          <p className="mt-1 text-sm text-accent">{resource.description}</p>
        </div>
      </li>
    ))}
  </ul>
);

/**
 * Canonical Secret Manager resource identity and presentation — name, slug,
 * Lucide icon, color classes, and the matching `ProjectPermissionSub`.
 * Use this instead of restating icon + `text-folder` (etc.) per page.
 */
const meta = {
  title: "Platform/SecretManagerResources",
  component: Catalog,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    resources: SECRET_MANAGER_RESOURCE_LIST
  }
} satisfies Meta<typeof Catalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CatalogList: Story = {
  name: "Example: Catalog"
};
