import type { Meta, StoryObj } from "@storybook/react-vite";

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
