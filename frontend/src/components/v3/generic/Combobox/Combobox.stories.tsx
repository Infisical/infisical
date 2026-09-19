import { createContext, type ReactNode, useContext, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "../Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../Dialog";
import { Field, FieldError, FieldLabel } from "../Field";
import { Combobox, type ComboboxProps } from "./Combobox";

const ENVIRONMENTS = [
  { id: "development", name: "Development" },
  { id: "staging", name: "Staging" },
  { id: "production", name: "Production" }
] as const;

const ORGANIZATION_ROLES = [
  {
    slug: "admin",
    name: "Admin",
    description: "Can manage organization settings, billing, members, and projects."
  },
  {
    slug: "member",
    name: "Member",
    description: "Can access assigned projects but cannot manage the organization."
  },
  {
    slug: "no-access",
    name: "No Access",
    description: "Cannot access the organization until a more permissive role is assigned."
  },
  ...Array.from({ length: 24 }, (_, index) => ({
    slug: `custom-role-${index + 1}`,
    name: `Custom role ${index + 1}`,
    description:
      "A custom organization role with a longer description that can wrap onto two lines."
  }))
];

const PROJECTS = Array.from({ length: 18 }, (_, index) => ({
  id: `project-${index + 1}`,
  name:
    index % 4 === 0 ? `Project ${index + 1} with a long descriptive name` : `Project ${index + 1}`
}));

const VAULTS = [
  { id: "engineering", name: "Engineering", items: 42 },
  { id: "infrastructure", name: "Infrastructure", items: 18 },
  { id: "security", name: "Security", items: 7 }
] as const;

type TagOption = { id: string; name: string; group: string };

const TAGS: TagOption[] = [
  { id: "production", name: "production", group: "Environment" },
  { id: "staging", name: "staging", group: "Environment" },
  { id: "compliance", name: "compliance", group: "Policy" },
  { id: "rotation-required", name: "rotation-required", group: "Policy" }
];

const sleep = (duration: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });

const ComboboxStoryPortalContext = createContext<HTMLElement | null>(null);

const StoryCombobox = <TOption,>(props: ComboboxProps<TOption>) => {
  const portalContainer = useContext(ComboboxStoryPortalContext);
  const { modal } = props;
  return <Combobox {...props} portalContainer={modal ? undefined : portalContainer} />;
};

const ComboboxStoryFrame = ({
  children,
  fullscreen = false
}: {
  children: ReactNode;
  fullscreen?: boolean;
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  return (
    <ComboboxStoryPortalContext.Provider value={portalContainer}>
      <div
        ref={setPortalContainer}
        className={
          fullscreen ? "relative w-full min-w-0 overflow-visible" : "relative min-h-96 w-80"
        }
      >
        {children}
      </div>
    </ComboboxStoryPortalContext.Provider>
  );
};

const meta = {
  title: "Generic/Combobox",
  component: Combobox,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    options: [],
    onValueChange: () => undefined,
    getOptionValue: () => "",
    getOptionLabel: () => ""
  },
  decorators: [
    (Story, context) => (
      <ComboboxStoryFrame fullscreen={context.parameters.layout === "fullscreen"}>
        <Story />
      </ComboboxStoryFrame>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj;

const DefaultRender = () => {
  const [value, setValue] = useState<(typeof ENVIRONMENTS)[number] | null>(null);

  return (
    <Field>
      <FieldLabel htmlFor="combobox-environment">Environment</FieldLabel>
      <StoryCombobox
        id="combobox-environment"
        options={ENVIRONMENTS}
        value={value}
        onValueChange={setValue}
        onClear={() => setValue(null)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select environment..."
        searchPlaceholder="Search environments..."
        searchAriaLabel="Search environments"
      />
    </Field>
  );
};

/**
 * `Combobox` is a searchable object select built on Base UI and styled to match
 * Infisical's Radix-based controls. It portals its menu, flips near viewport
 * edges, and limits the scrollable option list to the available space. Selected
 * values remain the original option objects for controlled form libraries.
 */
export const Default: Story = {
  render: () => <DefaultRender />
};

const RichOptionsRender = () => {
  const [value, setValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(
    ORGANIZATION_ROLES[1]
  );

  return (
    <Field>
      <FieldLabel htmlFor="combobox-role">Organization role</FieldLabel>
      <StoryCombobox
        id="combobox-role"
        options={ORGANIZATION_ROLES}
        value={value}
        onValueChange={setValue}
        getOptionValue={(option) => option.slug}
        getOptionLabel={(option) => option.name}
        getOptionKeywords={(option) => [option.description]}
        placeholder="Select role..."
        searchPlaceholder="Search roles..."
        searchAriaLabel="Search organization roles"
        renderOption={(option) => (
          <div className="min-w-0">
            <p className="truncate">{option.name}</p>
            <p className="text-xs leading-4 break-words whitespace-normal text-muted">
              {option.description}
            </p>
          </div>
        )}
      />
    </Field>
  );
};

export const RichOptions: Story = {
  name: "Example: Rich Options",
  parameters: {
    docs: {
      description: {
        story:
          "Use `renderOption` for supporting text or other rich row content. The combobox owns the selected check mark so custom rows retain consistent alignment and selection feedback."
      }
    }
  },
  render: () => <RichOptionsRender />
};

const OpaqueOptionFieldsRender = () => {
  const [value, setValue] = useState<(typeof VAULTS)[number] | null>(VAULTS[0]);

  return (
    <Field>
      <FieldLabel htmlFor="combobox-vault">Vault</FieldLabel>
      <StoryCombobox
        id="combobox-vault"
        options={VAULTS}
        value={value}
        onValueChange={setValue}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        getOptionKeywords={(option) => [`${option.items} items`]}
        placeholder="Select vault..."
        searchPlaceholder="Search vaults..."
        searchAriaLabel="Search vaults"
        renderOption={(option) => (
          <div className="flex min-w-0 items-center justify-between gap-4">
            <span className="truncate">{option.name}</span>
            <span className="shrink-0 text-xs text-muted">{option.items} items</span>
          </div>
        )}
      />
    </Field>
  );
};

export const OpaqueOptionFields: Story = {
  name: "Example: Opaque Option Fields",
  parameters: {
    docs: {
      description: {
        story:
          "Consumer option objects are opaque to the underlying primitive. Fields such as a numeric `items` count cannot be mistaken for the combobox's internal grouped-item structure."
      }
    }
  },
  render: () => <OpaqueOptionFieldsRender />
};

const MultipleRender = () => {
  const [value, setValue] = useState<(typeof PROJECTS)[number][]>(PROJECTS.slice(0, 2));

  return (
    <Field>
      <FieldLabel id="combobox-projects-label" htmlFor="combobox-projects">
        Projects
      </FieldLabel>
      <StoryCombobox
        id="combobox-projects"
        aria-labelledby="combobox-projects-label"
        multiple
        options={PROJECTS}
        value={value}
        onValueChange={(options) => setValue(options)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select projects..."
        searchPlaceholder="Search projects..."
        searchAriaLabel="Search projects"
        clearAriaLabel="Clear all projects"
      />
    </Field>
  );
};

/**
 * Multiple mode composes Base UI's chips and input. Arrow keys move between chips,
 * Backspace/Delete remove them, and selection leaves the popup open with the
 * search input cleared and focused.
 */
export const Multiple: Story = {
  name: "Multiple: Chips",
  render: () => <MultipleRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole("combobox", { name: "Projects" });

    await userEvent.click(canvas.getByText("Projects"));
    await userEvent.type(combobox, "Project 3");
    await expect(combobox).toHaveFocus();
    await expect(combobox).toHaveAccessibleName("Projects");
  }
};

const SelectAllRender = () => {
  const [value, setValue] = useState<(typeof PROJECTS)[number][]>([]);

  return (
    <Field>
      <FieldLabel htmlFor="combobox-select-all-projects">Projects</FieldLabel>
      <StoryCombobox
        id="combobox-select-all-projects"
        multiple
        isSelectAll
        options={PROJECTS}
        value={value}
        onValueChange={(options) => setValue(options)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select projects..."
        searchPlaceholder="Search projects..."
        searchAriaLabel="Search projects"
        clearAriaLabel="Clear all projects"
      />
    </Field>
  );
};

/**
 * `isSelectAll` adds a toggle above the option list that selects every option
 * matching the current search, then clears that same set once all are selected.
 */
export const SelectAll: Story = {
  name: "Multiple: Select All",
  render: () => <SelectAllRender />
};

const SingleLineRender = () => {
  const [value, setValue] = useState<(typeof PROJECTS)[number][]>(PROJECTS.slice(0, 12));

  return (
    <Field>
      <FieldLabel htmlFor="combobox-single-line-projects">Projects</FieldLabel>
      <StoryCombobox
        id="combobox-single-line-projects"
        multiple
        singleLine
        options={PROJECTS}
        value={value}
        onValueChange={(options) => setValue(options)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select projects..."
        searchPlaceholder="Search projects..."
        searchAriaLabel="Search projects"
        clearAriaLabel="Clear all projects"
      />
    </Field>
  );
};

/**
 * Single-line mode keeps the chips and search input on one row. Overflow scrolls
 * horizontally with a thin scrollbar while the clear button remains visible at
 * the trailing edge.
 */
export const SingleLine: Story = {
  name: "Multiple: Single Line",
  parameters: {
    docs: {
      description: {
        story:
          "Use `singleLine` when the control should behave like a text input instead of expanding vertically. Selected chips scroll horizontally with a thin scrollbar, and the clear button stays visible."
      }
    }
  },
  render: () => <SingleLineRender />
};

const OverflowedSelectionsRender = () => {
  const [value, setValue] = useState<(typeof PROJECTS)[number][]>(PROJECTS.slice(0, 12));

  return (
    <Field>
      <FieldLabel htmlFor="combobox-overflow-projects">Projects</FieldLabel>
      <StoryCombobox
        id="combobox-overflow-projects"
        multiple
        options={PROJECTS}
        value={value}
        onValueChange={(options) => setValue(options)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select projects..."
        searchPlaceholder="Search projects..."
        searchAriaLabel="Search projects"
      />
    </Field>
  );
};

export const OverflowedSelections: Story = {
  name: "Multiple: Overflowed Selections",
  parameters: {
    docs: {
      description: {
        story:
          "A large selection wraps into a bounded, internally scrollable chip area so the form cannot grow without limit. Every chip remains keyboard reachable and removable."
      }
    }
  },
  render: () => <OverflowedSelectionsRender />
};

const InDialogRender = () => {
  const [value, setValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(
    ORGANIZATION_ROLES[1]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Role Picker</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Organization Member</DialogTitle>
          <DialogDescription>Choose the organization role for this member.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="combobox-dialog-role">Organization role</FieldLabel>
          <StoryCombobox
            id="combobox-dialog-role"
            options={ORGANIZATION_ROLES}
            value={value}
            onValueChange={setValue}
            getOptionValue={(option) => option.slug}
            getOptionLabel={(option) => option.name}
            getOptionKeywords={(option) => [option.description]}
            placeholder="Select role..."
            searchPlaceholder="Search roles..."
            searchAriaLabel="Search organization roles"
            modal
            renderOption={(option) => (
              <div className="min-w-0">
                <p className="truncate">{option.name}</p>
                <p className="text-xs leading-4 break-words whitespace-normal text-muted">
                  {option.description}
                </p>
              </div>
            )}
          />
        </Field>
      </DialogContent>
    </Dialog>
  );
};

export const InDialog: Story = {
  name: "Example: In Dialog",
  parameters: {
    docs: {
      description: {
        story:
          "Set `modal` when the combobox is rendered inside a modal Dialog. Base UI then preserves focus containment and scroll access for its body-portalled option list."
      }
    }
  },
  render: () => <InDialogRender />
};

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-5">
      <Field data-invalid="true">
        <FieldLabel htmlFor="combobox-error">Environment</FieldLabel>
        <StoryCombobox
          id="combobox-error"
          options={ENVIRONMENTS}
          onValueChange={() => undefined}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          isError
        />
        <FieldError>Choose an environment.</FieldError>
      </Field>
      <Field data-disabled="true">
        <FieldLabel htmlFor="combobox-disabled">Environment</FieldLabel>
        <StoryCombobox
          id="combobox-disabled"
          options={ENVIRONMENTS}
          value={ENVIRONMENTS[0]}
          onValueChange={() => undefined}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          isDisabled
        />
      </Field>
      <Field data-disabled="true">
        <FieldLabel id="combobox-disabled-projects-label" htmlFor="combobox-disabled-projects">
          Projects
        </FieldLabel>
        <StoryCombobox
          id="combobox-disabled-projects"
          aria-labelledby="combobox-disabled-projects-label"
          multiple
          options={PROJECTS}
          value={PROJECTS.slice(0, 2)}
          onValueChange={() => undefined}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          isDisabled
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="combobox-loading">Environment</FieldLabel>
        <StoryCombobox
          id="combobox-loading"
          options={[]}
          onValueChange={() => undefined}
          getOptionValue={(option: (typeof ENVIRONMENTS)[number]) => option.id}
          getOptionLabel={(option) => option.name}
          isLoading
        />
      </Field>
    </div>
  )
};

const ViewportEdgesRender = () => {
  const [topValue, setTopValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(null);
  const [bottomValue, setBottomValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(null);

  const renderCombobox = (
    id: string,
    value: (typeof ORGANIZATION_ROLES)[number] | null,
    onValueChange: (option: (typeof ORGANIZATION_ROLES)[number]) => void
  ) => (
    <StoryCombobox
      id={id}
      options={ORGANIZATION_ROLES}
      value={value}
      onValueChange={onValueChange}
      getOptionValue={(option) => option.slug}
      getOptionLabel={(option) => option.name}
      getOptionKeywords={(option) => [option.description]}
      placeholder="Select role..."
      searchPlaceholder="Search roles..."
      searchAriaLabel="Search organization roles"
      renderOption={(option) => (
        <div className="min-w-0">
          <p className="truncate">{option.name}</p>
          <p className="text-xs leading-4 break-words whitespace-normal text-muted">
            {option.description}
          </p>
        </div>
      )}
    />
  );

  return (
    <div className="relative h-[32rem] min-h-[28rem] w-full min-w-0 p-2">
      <div className="absolute top-2 left-2 w-72">
        <Field>
          <FieldLabel htmlFor="combobox-top-edge">Near the Top Edge</FieldLabel>
          {renderCombobox("combobox-top-edge", topValue, setTopValue)}
        </Field>
      </div>
      <div className="absolute right-2 bottom-2 w-80 max-w-[calc(100vw-1rem)]">
        <Field>
          <FieldLabel htmlFor="combobox-bottom-edge">Near the Bottom Edge</FieldLabel>
          {renderCombobox("combobox-bottom-edge", bottomValue, setBottomValue)}
        </Field>
      </div>
    </div>
  );
};

export const ViewportEdges: Story = {
  name: "Example: Viewport Edges",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "Open either control to exercise Base UI collision handling. The bottom control flips above its trigger, and both long, multiline lists scroll within the available viewport height while the search field stays visible."
      }
    }
  },
  render: () => <ViewportEdgesRender />
};

/** Saved IDs remain visible even when a server search returns a different page. */
export const ServerFilteredSelection: Story = {
  name: "Example: Server-filtered Saved Selection",
  render: () => {
    const [value, setValue] = useState<string | null>("saved-workspace");
    const [query, setQuery] = useState("");
    const options = ["first-page-workspace", "another-workspace"].filter((id) =>
      id.includes(query)
    );
    return (
      <Combobox
        aria-label="Workspace"
        options={options}
        value={value}
        onValueChange={setValue}
        onClear={() => setValue(null)}
        getOptionValue={(id) => id}
        getOptionLabel={(id) => id}
        shouldFilter={false}
        includeMissingSelectedOptions={!query}
        onInputValueChange={setQuery}
      />
    );
  }
};

const CreatableSingleRender = () => {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([...ENVIRONMENTS]);
  const [value, setValue] = useState<{ id: string; name: string } | null>(null);

  return (
    <Field>
      <FieldLabel htmlFor="combobox-creatable-environment">Environment</FieldLabel>
      <StoryCombobox
        id="combobox-creatable-environment"
        options={options}
        value={value}
        onValueChange={setValue}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select or create an environment..."
        creation={{
          onCreate: (inputValue) => {
            const option = { id: inputValue, name: inputValue };
            setOptions((current) => [...current, option]);
            setValue(option);
          }
        }}
      />
    </Field>
  );
};

export const CreatableSingle: Story = {
  name: "Creation: Single",
  parameters: {
    docs: {
      description: {
        story:
          "Add `creation` to the existing controlled Combobox. `onCreate` owns domain-option construction and the controlled value update; the internal Create item never reaches `onValueChange`. The Create row remains available alongside partial matches."
      }
    }
  },
  render: () => <CreatableSingleRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Environment" });

    await userEvent.click(input);
    await userEvent.type(input, "prod");
    await expect(canvas.getByRole("option", { name: "Production" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("option", { name: 'Create "prod"' }));
    await expect(input).toHaveValue("prod");
    await expect(canvas.queryByRole("option", { name: 'Create "prod"' })).not.toBeInTheDocument();
  }
};

const AsyncCreationRender = () => {
  const [options, setOptions] = useState(TAGS);
  const [value, setValue] = useState<TagOption[]>([]);

  return (
    <Field>
      <FieldLabel htmlFor="combobox-async-tags">Tags</FieldLabel>
      <StoryCombobox
        id="combobox-async-tags"
        multiple
        options={options}
        value={value}
        onValueChange={(nextValue) => setValue(nextValue)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select or create tags..."
        creation={{
          isValid: (inputValue) => /^[a-z][a-z0-9-]*$/.test(inputValue),
          formatLabel: (inputValue) => `Create tag "${inputValue}"`,
          formatPendingLabel: (inputValue) => `Creating tag "${inputValue}"...`,
          formatError: () => "The tag could not be created. Check the slug and try again.",
          onCreate: async (inputValue) => {
            await sleep(350);
            if (inputValue === "reserved") {
              const failure: unknown = false;
              throw failure;
            }

            const option = { id: inputValue, name: inputValue, group: "Custom" };
            setOptions((current) => [...current, option]);
            setValue((current) =>
              current.some((tag) => tag.id === option.id) ? current : [...current, option]
            );
          }
        }}
      />
    </Field>
  );
};

export const AsyncCreation: Story = {
  name: "Creation: Async Pending and Failure",
  parameters: {
    docs: {
      description: {
        story:
          "Return the persistence promise from `onCreate`. While it is pending, the Create row is disabled so Enter or repeated clicks cannot start another request. Success clears the query after the caller updates its controlled options and value; rejection keeps the query and popup open and surfaces an inline retryable error."
      }
    }
  },
  render: () => <AsyncCreationRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Tags" });

    await userEvent.click(input);
    await userEvent.type(input, "release-ready");
    await userEvent.click(canvas.getByRole("option", { name: 'Create tag "release-ready"' }));
    await expect(
      canvas.getByRole("option", { name: 'Creating tag "release-ready"...' })
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      await canvas.findByRole("button", { name: "Remove release-ready" })
    ).toBeInTheDocument();

    await userEvent.type(input, "reserved");
    await userEvent.keyboard("{Enter}{Enter}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The tag could not be created"
    );
    await expect(input).toHaveValue("reserved");
  }
};

const AsyncLifecycleRender = () => {
  const [options, setOptions] = useState<TagOption[]>([]);
  const [value, setValue] = useState<TagOption[]>([]);

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="combobox-async-lifecycle">Tags</FieldLabel>
        <StoryCombobox
          id="combobox-async-lifecycle"
          multiple
          options={options}
          value={value}
          onValueChange={(nextValue) => setValue(nextValue)}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          placeholder="Select or create tags..."
          creation={{
            onCreate: async (inputValue) => {
              await sleep(500);
              const option = { id: inputValue, name: inputValue, group: "Custom" };
              setOptions((current) => [...current, option]);
              setValue((current) => [...current, option]);
            }
          }}
        />
      </Field>
      <Button variant="outline">Continue</Button>
    </div>
  );
};

export const DismissedPendingCreation: Story = {
  name: "Creation: Dismissed Pending Success",
  parameters: {
    docs: {
      description: {
        story:
          "Dismissing a multi-select while creation is pending keeps focus where the user moved it. Completion updates the caller-owned selection without reopening the popup or stealing focus."
      }
    }
  },
  render: () => <AsyncLifecycleRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Tags" });
    const continueButton = canvas.getByRole("button", { name: "Continue" });

    await userEvent.click(input);
    await userEvent.type(input, "deferred");
    await userEvent.click(canvas.getByRole("option", { name: 'Create "deferred"' }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(continueButton);
    await expect(
      await canvas.findByRole("button", { name: "Remove deferred" })
    ).toBeInTheDocument();
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(continueButton).toHaveFocus();
  }
};

export const PreserveNewQueryDuringCreation: Story = {
  name: "Creation: Preserve New Query During Success",
  parameters: {
    docs: {
      description: {
        story:
          "If the user starts another query while creation is pending, completion selects the caller-created option but does not clear or replace the newer query."
      }
    }
  },
  render: () => <AsyncLifecycleRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Tags" });

    await userEvent.click(input);
    await userEvent.type(input, "first-tag");
    await userEvent.click(canvas.getByRole("option", { name: 'Create "first-tag"' }));
    await userEvent.clear(input);
    await userEvent.type(input, "next-query");
    await expect(
      await canvas.findByRole("button", { name: "Remove first-tag" })
    ).toBeInTheDocument();
    await expect(input).toHaveValue("next-query");
    await expect(canvas.getByRole("option", { name: 'Create "next-query"' })).toBeInTheDocument();
  }
};

const UnmountPendingCreationRender = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [value, setValue] = useState<TagOption[]>([]);

  return (
    <div className="flex flex-col gap-4">
      {isVisible && (
        <Field>
          <FieldLabel htmlFor="combobox-unmount-pending">Tags</FieldLabel>
          <StoryCombobox
            id="combobox-unmount-pending"
            multiple
            options={value}
            value={value}
            onValueChange={(nextValue) => setValue(nextValue)}
            getOptionValue={(option) => option.id}
            getOptionLabel={(option) => option.name}
            placeholder="Select or create tags..."
            creation={{
              onCreate: async (inputValue) => {
                await sleep(500);
                setValue((current) => [
                  ...current,
                  { id: inputValue, name: inputValue, group: "Custom" }
                ]);
              }
            }}
          />
        </Field>
      )}
      <Button variant="outline" onClick={() => setIsVisible(false)}>
        Hide combobox
      </Button>
      <p role="status">{value.length === 1 ? "Created 1 tag" : "Waiting for creation"}</p>
    </div>
  );
};

export const UnmountedPendingCreation: Story = {
  name: "Creation: Unmounted Pending Success",
  parameters: {
    docs: {
      description: {
        story:
          "Unmounting while creation is pending invalidates the Combobox request lifecycle. The caller-owned request can still complete without causing the removed Combobox to update state or steal focus."
      }
    }
  },
  render: () => <UnmountPendingCreationRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Tags" });
    const hideButton = canvas.getByRole("button", { name: "Hide combobox" });

    await userEvent.click(input);
    await userEvent.type(input, "unmounted");
    await userEvent.click(canvas.getByRole("option", { name: 'Create "unmounted"' }));
    await userEvent.click(hideButton);
    await expect(canvas.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
    await expect(await canvas.findByText("Created 1 tag")).toBeInTheDocument();
    await expect(hideButton).toHaveFocus();
  }
};

const ValidatedCreationRender = () => {
  const [value, setValue] = useState<TagOption[]>([]);
  const knownOrganizationEmails = ["member@example.com", "admin@example.com"];

  return (
    <Field>
      <FieldLabel htmlFor="combobox-validated-email">Approvers</FieldLabel>
      <StoryCombobox
        id="combobox-validated-email"
        multiple
        options={TAGS}
        value={value}
        onValueChange={(nextValue) => setValue(nextValue)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        placeholder="Select approvers or enter a member email..."
        creation={{
          isValid: (inputValue) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputValue) &&
            !knownOrganizationEmails.includes(inputValue.toLocaleLowerCase()),
          isDuplicate: (inputValue, option) =>
            option.id.toLocaleLowerCase() === inputValue.toLocaleLowerCase(),
          formatLabel: (inputValue) => `Use member email "${inputValue}"`,
          onCreate: (inputValue) =>
            setValue((current) => [
              ...current,
              { id: inputValue, name: inputValue, group: "Member email" }
            ])
        }}
      />
    </Field>
  );
};

export const ValidatedCreation: Story = {
  name: "Creation: Validation and Domain Duplicates",
  parameters: {
    docs: {
      description: {
        story:
          "`isValid` can close over domain data that is not in the current result page, as invitation and manual-approval forms require. `isDuplicate` overrides the default exact, case-sensitive label comparison when a domain uses another identity rule."
      }
    }
  },
  render: () => <ValidatedCreationRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Approvers" });

    await userEvent.click(input);
    await userEvent.type(input, "member@example.com");
    await expect(
      canvas.queryByRole("option", { name: 'Use member email "member@example.com"' })
    ).not.toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "new.member@example.com");
    await expect(
      canvas.getByRole("option", { name: 'Use member email "new.member@example.com"' })
    ).toBeInTheDocument();
  }
};

const GroupedRemoteCreationRender = () => {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(TAGS);
  const [value, setValue] = useState<TagOption[]>([]);
  const results = options.filter((option) => option.name.includes(query));

  return (
    <Field>
      <FieldLabel htmlFor="combobox-remote-tags">Remote tags</FieldLabel>
      <StoryCombobox
        id="combobox-remote-tags"
        multiple
        isSelectAll
        options={results}
        value={value}
        onValueChange={(nextValue) => setValue(nextValue)}
        onInputValueChange={setQuery}
        shouldFilter={false}
        includeMissingSelectedOptions={false}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        getOptionGroup={(option) => option.group}
        creation={{
          onCreate: (inputValue) => {
            const option = { id: inputValue, name: inputValue, group: "Custom" };
            setOptions((current) => [...current, option]);
            setValue((current) => [...current, option]);
          }
        }}
      />
    </Field>
  );
};

export const GroupedRemoteCreation: Story = {
  name: "Creation: Grouped Remote Results and Select All",
  parameters: {
    docs: {
      description: {
        story:
          "Creation composes with grouped, server-filtered multi-select results. The internal Create item stays outside domain groups and Select All counts and selects only real options."
      }
    }
  },
  render: () => <GroupedRemoteCreationRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Remote tags" });

    await userEvent.click(input);
    await userEvent.type(input, "prod");
    await expect(canvas.getByRole("button", { name: "Select All (1)" })).toBeInTheDocument();
    await expect(canvas.getByRole("option", { name: 'Create "prod"' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Select All (1)" }));
    await expect(canvas.getByRole("button", { name: "Remove production" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Remove prod" })).not.toBeInTheDocument();
  }
};
