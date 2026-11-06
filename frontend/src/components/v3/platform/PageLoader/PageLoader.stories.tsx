import type { Meta, StoryObj } from "@storybook/react-vite";

import { PageLoader } from "./PageLoader";

/**
 * `PageLoader` is the route-level pending state: the branded `Loader` centered in
 * a wrapper that fills its parent (`h-full w-full`). It does not set its own
 * viewport height, so the surrounding layout decides how tall the wait is.
 *
 * Pass `text` when the wait needs an explanation, such as an OAuth callback or
 * workspace setup. The text renders below the mark and becomes the loader's
 * accessible label, so screen readers announce it once instead of "Loading".
 *
 * A page that renders outside a layout and needs the full viewport, as V2
 * `ContentLoader` did with `h-screen`, wraps it in its own container:
 * `<div className="h-screen"><PageLoader text="..." /></div>`.
 */
const meta = {
  title: "Platform/Page Loader",
  component: PageLoader,
  parameters: {
    layout: "fullscreen"
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: "text"
    },
    lottieClassName: {
      table: { disable: true }
    }
  },
  decorators: [
    (Story) => (
      <div className="h-96 bg-page">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof PageLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The mark alone, announced with the default `Loading` label. Use for ordinary route and data waits."
      }
    }
  }
};

export const WithText: Story = {
  name: "Example: With Text",
  args: {
    text: "Creating your GitHub App, please wait..."
  },
  parameters: {
    docs: {
      description: {
        story:
          "Visible copy below the mark for waits that need context. Keep it to one short sentence in sentence case."
      }
    }
  }
};
