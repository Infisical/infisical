import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";

import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { Loader } from "./Loader";

/**
 * `Loader` is the branded Infisical loading animation — the stroke-draw of the
 * logo mark. It is the single source for that animation: the mark, the
 * tints, and the size scale all live here, and every product call site composes
 * it rather than naming a Lottie asset itself, including the router's full-page
 * pending state in `main.tsx`.
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
 *
 * When the operating system requests reduced motion, the player holds the fully
 * drawn first frame instead of looping, and the `role="status"` semantics keep
 * announcing the pending state. There is no story for that state, because the
 * component reads the `prefers-reduced-motion` media query directly and this
 * Storybook has no addon that can emulate a media feature, so no decorator can
 * force it. Review it either by turning on the operating system's reduce-motion
 * setting, or in Chrome DevTools: open the command menu, run "Show Rendering",
 * and set "Emulate CSS media feature prefers-reduced-motion" to `reduce`.
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
      description:
        "Token variants recolor the existing animated mark without changing its motion. The product variant uses --product-color, just like Button.",
      control: "select",
      options: [
        "brand",
        "inverse",
        "neutral",
        "background",
        "org",
        "sub-org",
        "project",
        "success",
        "info",
        "warning",
        "pam",
        "av",
        "product"
      ]
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
    variant: "brand"
  }
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The default: the brand-colored mark at `md`. Standalone loaders and `PageLoader` keep this tint. Pending controls choose their tint from the button variant instead. The animation loops for as long as the wait lasts, or remains on its fully drawn first frame when the operating system requests reduced motion. It carries no progress information, so pair it with copy when the wait is long enough to need explaining."
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
          "The explicit black mark for inverted surfaces. Shown here on `bg-foreground`, since it is invisible against the dark page. Automatic pending controls use theme-aware tokens instead."
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
          "The colored mark and the standalone default tint. Choose a token variant when the loader needs to follow the surface's scope or semantic intent."
      }
    }
  }
};

export const VariantProduct: Story = {
  name: "Variant: Product",
  args: {
    variant: "product",
    style: { "--product-color": "var(--color-product-kms)" } as CSSProperties
  },
  parameters: {
    docs: {
      description: {
        story:
          "Set --product-color to the product's existing token. This example uses the KMS token; the product-color utility resolves its light-theme tint just as it does for a product Button."
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
          "`Button` composes `Loader` itself: set `isPending` and the label goes transparent while the `sm` mark draws over the control. Scope and product variants choose their matching token; danger and uncolored variants choose neutral. Prefer `isPending` over rendering a `Loader` as a Button child — it also disables the control, which is what stops the double submit."
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
          "`IconButton` uses the same variant mapping as `Button`, sizing the mark to the control. Its solid `default` variant uses the background token so the mark stays legible against `bg-foreground` in both themes. Use it for row actions and toolbar triggers that fire a mutation."
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
