import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Markdown } from "./Markdown";

const meta = {
  title: "Generic/Markdown",
  component: Markdown,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: `# Release checklist

Run these steps **before** tagging a release, and read [the guide](https://example.com) first.

## Steps

1. Update \`CHANGELOG.md\`.
2. Run the test suite:

   \`\`\`bash
   npm test
   \`\`\`

3. Open a pull request.

> Ask the owning team for review.

---

## Status

| Step | Owner | Done |
| :--- | :---- | ---: |
| Changelog | Docs | yes |
| Tests | Platform | ~~no~~ yes |

- [x] Tag the release
- [ ] Announce it

- Raw <b>HTML</b> is left out.
- Images show their alt text: ![build status](https://example.com/badge.svg)
`
  }
};

export const RelativeLinks: Story = {
  args: {
    children: "Read [the guide](references/guide.md) or [the docs](https://infisical.com/docs).",
    onRelativeLinkClick: fn()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = canvasElement.ownerDocument.defaultView!.location.href;
    const guide = canvas.getByRole("link", { name: "the guide" });

    await userEvent.click(guide);
    await expect(args.onRelativeLinkClick).toHaveBeenCalledWith("references/guide.md");
    await expect(canvasElement.ownerDocument.defaultView!.location.href).toBe(page);
    await expect(guide).toHaveAttribute("href", "#");

    const docs = canvas.getByRole("link", { name: "the docs" });
    await expect(docs).toHaveAttribute("href", "https://infisical.com/docs");
    await expect(docs).toHaveAttribute("target", "_blank");
    await expect(args.onRelativeLinkClick).toHaveBeenCalledTimes(1);
  }
};
