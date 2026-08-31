import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";

import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { Loader } from "./Loader";

/**
 * `Loader` is the branded Infisical loading animation — the stroke-draw of the
 * logo mark. It is the single source for that animation: the mark, the three
 * tints, and the size scale all live here, so no consumer references a Lottie
 * asset directly.
 *
 * Reach for `Loader` when the surface is Infisical's own and the wait is
 * unmeasurable: full-page route transitions (`PageLoader`), pending `Button`
 * and `IconButton` states, and section-level fetches inside a `Card`. Reach for
 * `Spinner` instead for compact inline refreshes — a neutral circle in a table
 * header or beside a row — where the brand mark would be too loud and too wide.
 * Reach for `Skeleton` whenever the shape of the pending content is already
 * known.
 *
 * The scale is expressed as **widths** because the mark is 1.91:1, not square;
 * height follows the asset. `className` merges through `cn` and wins, so a
 * call site sitting between steps (`w-24` for `PageLoader`) can set its own
 * width without a new size.
 */
const meta = {
  title: "Generic/Loader",
  component: Loader,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "inverse", "brand"]
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"]
    },
    label: {
      control: "text"
    },
    className: {
      table: { disable: true }
    }
  },
  args: {
    label: "Loading",
    size: "md",
    variant: "default"
  }
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The in-product default: the white mark at `md`. Use it on any dark product surface — a `Card` body waiting on a fetch, a section that owns its own loading state. The animation loops for as long as the wait lasts; it carries no progress information, so pair it with copy when the wait is long enough to need explaining."
      }
    }
  }
};

export const VariantDefault: Story = {
  name: "Variant: Default",
  args: {
    variant: "default"
  },
  parameters: {
    docs: {
      description: {
        story:
          "White mark. The in-product default — correct on every dark surface in the app (`bg-page`, `bg-card`, `bg-popover`) and on tinted controls, where the button's own tint shows through around the stroke."
      }
    }
  }
};

export const VariantInverse: Story = {
  name: "Variant: Inverse",
  decorators: [
    (Story) => (
      <div className="rounded-md bg-foreground p-6">
        <Story />
      </div>
    )
  ],
  args: {
    variant: "inverse"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Black mark, for inverted surfaces where the foreground color is the background — the solid `default` `IconButton`, and anything else painted `bg-foreground`. Shown here on `bg-foreground`, since it is invisible against the page."
      }
    }
  }
};

export const VariantBrand: Story = {
  name: "Variant: Brand",
  args: {
    variant: "brand"
  },
  parameters: {
    docs: {
      description: {
        story:
          "The colored mark. Reserve it for brand-forward moments: the router's own pending state before the product chrome exists, full-screen `ContentLoader` waits, and connection tests that stand in for the product itself. Do not use it as a generic accent inside routine product UI."
      }
    }
  }
};

export const Sizes: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use `xs` inside compact controls, `sm` inside standard `Button` and `IconButton` pending states, `md` for a section or table body that owns its loading state, and `lg` only for a full-page or full-screen wait. Sizes are widths; pass `className` when a call site needs a width between two steps."
      }
    }
  },
  render: () => (
    <div className="flex items-end gap-6">
      {(["xs", "sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2 text-xs text-muted">
          <Loader size={size} label={`Loading ${size} example`} />
          <span>{size}</span>
        </div>
      ))}
    </div>
  )
};

export const ExamplePendingButton: Story = {
  name: "Example: Pending Button",
  parameters: {
    docs: {
      description: {
        story:
          "`Button` composes `Loader` itself: set `isPending` and the label goes transparent while the `sm` mark draws over the control. Never render a `Loader` as a Button child by hand — `isPending` also disables the control, which is what stops the double submit."
      }
    }
  },
  render: () => (
    <div className="flex items-center gap-3">
      <Button isPending variant="org">
        Save Changes
      </Button>
      <Button isPending variant="outline">
        Save Changes
      </Button>
    </div>
  )
};

export const ExamplePendingIconButton: Story = {
  name: "Example: Pending Icon Button",
  parameters: {
    docs: {
      description: {
        story:
          "`IconButton` composes `Loader` the same way, sizing the mark to the control and switching to the `inverse` tint on the solid `default` variant so the stroke stays legible against `bg-foreground`. Use it for row actions and toolbar triggers that fire a mutation."
      }
    }
  },
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton isPending aria-label="Refresh">
        <RefreshCwIcon />
      </IconButton>
      <IconButton isPending variant="outline" aria-label="Refresh">
        <RefreshCwIcon />
      </IconButton>
      <IconButton isPending variant="danger" aria-label="Delete">
        <Trash2Icon />
      </IconButton>
    </div>
  )
};

export const ExamplePageLoader: Story = {
  name: "Example: Page Loader",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "The full-page composition `PageLoader` renders: the mark centered in a `flex h-full w-full items-center justify-center` wrapper at `w-24`, between the `md` and `lg` steps. Use `PageLoader` from `@app/components/v3` rather than rebuilding this — it is what every route-level pending state already reaches for."
      }
    }
  },
  render: () => (
    <div className="h-96 bg-page">
      <div className="flex h-full w-full items-center justify-center">
        <Loader className="w-24" label="Loading page" />
      </div>
    </div>
  )
};
