import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CopyIcon, EyeIcon, EyeOffIcon, MailIcon, SearchIcon, SendIcon, XIcon } from "lucide-react";

import { Button } from "../Button";
import { Field, FieldError, FieldLabel } from "../Field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextArea
} from "./InputGroup";

/**
 * `InputGroup` is a composition primitive that wraps an input (or textarea) and
 * decorates it with addons — icons, text, action buttons, or full-width header /
 * footer rows. Use it whenever a control needs more chrome than a bare `Input`:
 * a search icon, a `https://` prefix, an inline "Copy" button, a character
 * counter under a composer, etc.
 *
 * **Anatomy**: `InputGroup` is the chromed container. Inside it, place exactly
 * one focusable control (`InputGroupInput` or `InputGroupTextArea`) plus any
 * number of `InputGroupAddon`s. Each addon's `align` prop controls placement:
 * `inline-start` / `inline-end` (left / right of a single-line control), or
 * `block-start` / `block-end` (full-width header / footer rows that turn the
 * group into a stacked layout — automatically used when wrapping a textarea).
 *
 * For labels, helper text, and validation messages, compose with
 * `Field` / `FieldLabel` / `FieldDescription` / `FieldError` from `../Field` —
 * `InputGroup` only owns the control + its addons.
 */
const meta = {
  title: "Generic/InputGroup",
  component: InputGroup,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    className: { table: { disable: true } },
    children: { table: { disable: true } }
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Anatomy: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The bare baseline — `InputGroup` wrapping an `InputGroupInput`. Without addons it looks like an `Input` with the same chrome; reach for a plain `Input` instead unless you need the group's `:has()` behavior."
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Acme Corporation" />
    </InputGroup>
  )
};

export const Outlined: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Detached outline treatment for selected onboarding and authentication flows. Use the default variant for ordinary product forms and search controls."
      }
    }
  },
  render: () => (
    <InputGroup variant="outlined">
      <InputGroupInput placeholder="Acme Corporation" />
    </InputGroup>
  )
};

export const AddonInlineStart: Story = {
  name: "Anatomy: Addon Inline Start",
  parameters: {
    docs: {
      description: {
        story:
          '`align="inline-start"` (the default) puts an addon on the leading edge of the input. The addon is a single click-target — clicking it focuses the input.'
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search secrets…" />
    </InputGroup>
  )
};

export const AddonInlineEnd: Story = {
  name: "Anatomy: Addon Inline End",
  parameters: {
    docs: {
      description: {
        story:
          '`align="inline-end"` places an addon on the trailing edge. Use for status icons, validation hints, or trailing text affordances.'
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupInput type="email" placeholder="you@infisical.com" />
      <InputGroupAddon align="inline-end">
        <MailIcon />
      </InputGroupAddon>
    </InputGroup>
  )
};

export const AddonBlockStart: Story = {
  name: "Anatomy: Addon Block Start",
  parameters: {
    docs: {
      description: {
        story:
          '`align="block-start"` turns the group into a stacked layout with a full-width header row above the input. Useful for inline section labels or breadcrumb-style context.'
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Subdomain</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="acme" />
    </InputGroup>
  )
};

export const AddonBlockEnd: Story = {
  name: "Anatomy: Addon Block End",
  parameters: {
    docs: {
      description: {
        story:
          '`align="block-end"` adds a full-width footer row beneath the control — most often a toolbar for a `InputGroupTextArea`, but it works under a single-line input too.'
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Tag a teammate…" />
      <InputGroupAddon align="block-end">
        <InputGroupText>Press Enter to mention</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
};

export const WithText: Story = {
  name: "Variant: Text",
  parameters: {
    docs: {
      description: {
        story:
          "`InputGroupText` is the typography slot for non-interactive labels — protocol prefixes, unit suffixes, fixed domain parts. Muted color and consistent icon sizing are inherited automatically."
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="acme" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>.infisical.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
};

export const WithButton: Story = {
  name: "Variant: Button",
  parameters: {
    docs: {
      description: {
        story:
          '`InputGroupButton` is a v3 `IconButton` re-skinned for the in-group context — square, ghost-muted, and tucked snugly against the trailing edge of the group. Choose `size="xs"` (default) for tight rows and `size="sm"` for roomier ones. Always set `aria-label` since there is no visible text, and rely on the default `type="button"` so the button does not submit the surrounding form.'
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupInput defaultValue="https://app.infisical.com/share/abc123" readOnly />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Copy link">
          <CopyIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
};

export const WithTextArea: Story = {
  name: "Variant: TextArea",
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Swap `InputGroupInput` for `InputGroupTextArea` to get a multi-line composer. The group auto-expands to fit the textarea and a `block-end` toolbar provides a natural home for primary / secondary actions."
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupTextArea rows={4} placeholder="Leave a comment…" />
      <InputGroupAddon align="block-end">
        <Button size="xs" variant="ghost" className="ml-auto">
          Cancel
        </Button>
        <Button size="xs" variant="outline">
          <SendIcon />
          Send
        </Button>
      </InputGroupAddon>
    </InputGroup>
  )
};

export const Disabled: Story = {
  name: "State: Disabled",
  parameters: {
    docs: {
      description: {
        story:
          'Set `data-disabled="true"` on the group and `disabled` on the control to soften its border, text, and addons while blocking pointer interaction for the whole group.'
      }
    }
  },
  render: () => (
    <InputGroup data-disabled="true">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput defaultValue="Unavailable input" disabled />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="xs" aria-label="Clear" disabled>
          <XIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
};

export const WithError: Story = {
  name: "State: Error",
  parameters: {
    docs: {
      description: {
        story:
          "Set `aria-invalid` (or `isError` on `InputGroupInput`) and the danger border + ring spans the *whole* group — addons and all — so the error reads as a property of the field, not just the control. Pair with a `FieldError` for sighted-user feedback."
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <MailIcon />
      </InputGroupAddon>
      <InputGroupInput type="email" defaultValue="not-an-email" isError />
    </InputGroup>
  )
};

export const WithErrorTextArea: Story = {
  name: "State: Error (TextArea)",
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          "`InputGroupTextArea` carries the same `isError` API as `InputGroupInput` — flip it on and the danger border + ring spans the whole group, including any `block-end` toolbar. Use this when a `TextArea` plus its addons should read as a single invalid field."
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupTextArea rows={3} defaultValue="no" isError />
      <InputGroupAddon align="block-end">
        <InputGroupText>Add at least 20 characters of context.</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
};

export const ErrorAnimation: Story = {
  name: "Example: Error Animation",
  parameters: {
    docs: {
      description: {
        story:
          "Submit the form to transition the grouped input into its invalid state. Only the outer InputGroup shell shakes; its input and addon move together. Reset the example before submitting again to replay the transition."
      }
    }
  },
  render: function ErrorAnimationRender() {
    const [isError, setIsError] = useState(false);

    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setIsError(true);
        }}
      >
        <Field data-invalid={isError}>
          <FieldLabel htmlFor="input-group-error-animation">Email</FieldLabel>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <MailIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="input-group-error-animation"
              type="email"
              defaultValue="not-an-email"
              isError={isError}
            />
          </InputGroup>
          <FieldError isOpen={isError}>Enter a valid email address.</FieldError>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm" isDisabled={isError}>
            Trigger Error
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setIsError(false)}>
            Reset
          </Button>
        </div>
      </form>
    );
  }
};

export const SearchWithClear: Story = {
  name: "Example: Search With Clear",
  render: function SearchWithClearRender() {
    const [value, setValue] = useState("kubernetes");
    return (
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search secrets…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {value.length > 0 && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs" aria-label="Clear search" onClick={() => setValue("")}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The canonical search field: leading `<SearchIcon />`, trailing icon-only clear button that only renders when the value is non-empty. The clear button calls `setValue("")` on click.'
      }
    }
  }
};

export const PasswordWithReveal: Story = {
  name: "Example: Password With Reveal",
  render: function PasswordWithRevealRender() {
    const [show, setShow] = useState(false);
    return (
      <InputGroup>
        <InputGroupInput
          type={show ? "text" : "password"}
          defaultValue="hunter2"
          autoComplete="current-password"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="xs"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Toggle between `type="password"` and `type="text"` on click. Always set `autoComplete` (e.g. `current-password` or `new-password`) so password managers behave correctly.'
      }
    }
  }
};

export const UrlWithProtocol: Story = {
  name: "Example: URL With Protocol",
  parameters: {
    docs: {
      description: {
        story:
          "Use an `InputGroupText` prefix to fix part of the value users do not need to type — protocols, country codes, currency symbols. Strip the prefix from the captured value before submitting."
      }
    }
  },
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="api.example.com" />
    </InputGroup>
  )
};

const TWEET_LIMIT = 280;

export const TextAreaWithCharCounter: Story = {
  name: "Example: TextArea With Character Counter",
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ],
  render: function TextAreaWithCharCounterRender() {
    const [value, setValue] = useState("");
    const isError = value.length > TWEET_LIMIT;
    return (
      <InputGroup>
        <InputGroupTextArea
          rows={4}
          placeholder="What's on your mind?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          isError={isError}
        />
        <InputGroupAddon align="block-end">
          <InputGroupText>
            {value.length} / {TWEET_LIMIT}
          </InputGroupText>
          <Button
            className="ml-auto"
            size="xs"
            variant="outline"
            isDisabled={value.length === 0 || isError}
          >
            <SendIcon />
            Post
          </Button>
        </InputGroupAddon>
      </InputGroup>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Controlled `InputGroupTextArea` with a live character count in a `block-end` toolbar. Crossing the limit flips the textarea to its error state and disables the submit button."
      }
    }
  }
};
