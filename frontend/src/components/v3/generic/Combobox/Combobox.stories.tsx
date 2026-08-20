import { createContext, type ReactNode, useContext, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

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

const MultipleRender = () => {
  const [value, setValue] = useState<(typeof PROJECTS)[number][]>(PROJECTS.slice(0, 2));

  return (
    <Field>
      <FieldLabel htmlFor="combobox-projects">Projects</FieldLabel>
      <StoryCombobox
        id="combobox-projects"
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
  render: () => <MultipleRender />
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
