import {
  type ComponentType,
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { useDebounce } from "@app/hooks";

import { Button } from "../Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../Dialog";
import { Field, FieldError, FieldLabel } from "../Field";
import { Input } from "../Input";
import { TextArea } from "../TextArea";
import { Combobox, type ComboboxDialogCreationRenderProps, type ComboboxProps } from ".";

const ENVIRONMENTS = [
  { id: "development", name: "Development" },
  { id: "staging", name: "Staging" },
  { id: "production", name: "Production" }
] as const;

const ORGANIZATION_ROLES = [
  {
    slug: "admin",
    name: "Admin",
    items: 4,
    description: "Can manage organization settings, billing, members, and projects."
  },
  {
    slug: "member",
    name: "Member",
    items: 38,
    description: "Can access assigned projects but cannot manage the organization."
  },
  {
    slug: "no-access",
    name: "No Access",
    items: 2,
    description: "Cannot access the organization until a more permissive role is assigned."
  },
  ...Array.from({ length: 24 }, (_, index) => ({
    slug: `custom-role-${index + 1}`,
    name: `Custom role ${index + 1}`,
    items: index + 1,
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

const getTrailingSlot = (input: HTMLElement) => {
  const control = input.closest("[data-slot='combobox-control']") ?? input.parentElement;
  return control?.querySelector("[data-slot='combobox-trailing-slot']");
};

const clickOpenTrailingClear = (input: HTMLElement) => {
  const button = getTrailingSlot(input)?.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) throw new Error("Expected a trailing clear button");
  button.click();
};

const ComboboxStoryPortalContext = createContext<HTMLElement | null>(null);

const StoryCombobox = <TOption,>(props: ComboboxProps<TOption>) => {
  const portalContainer = useContext(ComboboxStoryPortalContext);
  const { modal } = props;
  const StoryComponent = Combobox as ComponentType<ComboboxProps<TOption>>;
  return <StoryComponent {...props} portalContainer={modal ? undefined : portalContainer} />;
};

export const ComboboxStoryFrame = ({
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
  includeStories: [
    "Default",
    "RichOptions",
    "Multiple",
    "ChipLayouts",
    "ServerSearch",
    "InDialog",
    "States",
    "InlineCreation",
    "DialogCreation",
    "GroupedRemoteCreation"
  ],
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
  const [clearCount, setClearCount] = useState(0);

  return (
    <div>
      <Field>
        <FieldLabel htmlFor="combobox-environment">Environment</FieldLabel>
        <StoryCombobox
          id="combobox-environment"
          options={ENVIRONMENTS}
          value={value}
          onValueChange={(nextValue: (typeof ENVIRONMENTS)[number] | null) => {
            setValue(nextValue);
            if (nextValue === null) setClearCount((current) => current + 1);
          }}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          placeholder="Select environment..."
          searchPlaceholder="Search environments..."
          searchAriaLabel="Search environments"
        />
      </Field>
      <p className="sr-only">Clear actions: {clearCount}</p>
    </div>
  );
};

/**
 * `Combobox` is a searchable object select built on Base UI and styled to match
 * Infisical's Radix-based controls. It portals its menu, flips near viewport
 * edges, and limits the scrollable option list to the available space. Selected
 * values remain the original option objects for controlled form libraries. Single
 * selections are clearable by default and emit `null`; use `onClear` to override
 * that reset or `isClearable={false}` when the domain has no empty state.
 */
export const Default: Story = {
  render: () => <DefaultRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Environment" });

    await expect(input).toHaveAttribute("placeholder", "Select environment...");
    await expect(getTrailingSlot(input)).toHaveAttribute("data-state", "chevron");
    await userEvent.click(input);
    await expect(input).toHaveAttribute("placeholder", "Select environment...");
    await userEvent.type(input, "prod");
    await expect(input).toHaveValue("prod");
    await userEvent.click(canvas.getByRole("option", { name: "Production" }));
    await expect(input).toHaveValue("Production");
    await expect(getTrailingSlot(input)).toHaveAttribute("data-state", "clear");

    await userEvent.click(canvas.getByRole("button", { name: "Clear selection" }));
    await expect(input).toHaveValue("");
    await expect(getTrailingSlot(input)).toHaveAttribute("data-state", "chevron");

    await userEvent.click(input);
    await userEvent.click(canvas.getByRole("option", { name: "Staging" }));
    await userEvent.click(input);
    await expect(input).toHaveValue("Staging");
    await expect(canvas.getByRole("option", { name: "Development" })).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Clear selection", hidden: true })
    ).toBeInTheDocument();
    await userEvent.type(input, "dev");
    await expect(input).toHaveValue("dev");
    clickOpenTrailingClear(input);
    await waitFor(() => expect(input).toHaveValue(""));
    await expect(getTrailingSlot(input)).toHaveAttribute("data-state", "chevron");
  }
};

const ALL_ORGANIZATIONS = Array.from({ length: 2_000 }, (_, index) => ({
  id: `org-${index + 1}`,
  name: `Organization ${index + 1}`
}));

const PAGE_SIZE = 25;

// Stands in for a paginated list endpoint: matches server-side and returns only the first page.
const fetchOrganizations = (search: string) =>
  new Promise<{ organizations: typeof ALL_ORGANIZATIONS; totalCount: number }>((resolve) => {
    setTimeout(() => {
      const query = search.trim().toLocaleLowerCase();
      const matches = ALL_ORGANIZATIONS.filter((org) =>
        org.name.toLocaleLowerCase().includes(query)
      );
      resolve({ organizations: matches.slice(0, PAGE_SIZE), totalCount: matches.length });
    }, 400);
  });

const ServerSearchRender = () => {
  const [value, setValue] = useState<(typeof ALL_ORGANIZATIONS)[number] | null>(
    ALL_ORGANIZATIONS[1998]
  );
  const [valueChangeCount, setValueChangeCount] = useState(0);
  const [clearOverrideCount, setClearOverrideCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [organizations, setOrganizations] = useState<typeof ALL_ORGANIZATIONS>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    fetchOrganizations(debouncedSearch).then((page) => {
      if (!isCurrent) return;
      setOrganizations(page.organizations);
      setTotalCount(page.totalCount);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [debouncedSearch]);

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor="combobox-server-search">Organization</FieldLabel>
        <StoryCombobox
          id="combobox-server-search"
          options={organizations}
          value={value}
          onValueChange={(nextValue: (typeof ALL_ORGANIZATIONS)[number]) => {
            setValue(nextValue);
            setValueChangeCount((current) => current + 1);
          }}
          onClear={() => {
            setValue(null);
            setClearOverrideCount((current) => current + 1);
          }}
          onSearchChange={setSearch}
          isLoading={isLoading || search !== debouncedSearch}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          placeholder="Select organization..."
          searchPlaceholder="Search organizations..."
          searchAriaLabel="Search organizations"
          emptyMessage="No organizations match that search."
          renderValue={(option) => (
            <span data-testid="server-selected-value" className="font-medium">
              {option.name}
            </span>
          )}
          listFooter={
            totalCount > organizations.length
              ? `Showing ${organizations.length} of ${totalCount.toLocaleString()} — type to search the rest`
              : null
          }
        />
      </Field>
      <p data-testid="server-query" className="text-xs text-muted">
        Remote query: {search || "(empty)"}
      </p>
      <p className="sr-only">Selected organization: {value?.name ?? "none"}</p>
      <p className="sr-only" data-testid="server-callback-counts">
        Value changes: {valueChangeCount}; clear overrides: {clearOverrideCount}
      </p>
    </div>
  );
};

/**
 * Passing `onSearchChange` hands filtering to the caller: the internal matcher is switched off
 * and `options` renders exactly as given. Use it when the option set is too large to send in
 * full, so the popup shows one page of server results and typing fetches the next one. Debounce
 * the query on your side, and pair it with `isLoading` so the popup says it is still working —
 * cover the debounce window as well as the request, or the stale page reads as the answer.
 *
 * It also turns off the auto-highlight that local filtering uses: the list arrives after a debounce
 * and a round trip, so highlighting the top match would put it on a row the user has not seen yet and
 * Enter would commit it. Pair the prop with `listFooter` to say that the list is only one page.
 *
 * This story searches 2,000 organizations through a fake endpoint that returns 25 at a time.
 * Without `onSearchChange` the component would only ever match within those 25.
 */
export const ServerSearch: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Caller-owned search renders one fetched page at a time while preserving the controlled selection object even when that saved option is absent from the current page. Debounce the query and keep `isLoading` true across both the debounce and request windows."
      }
    }
  },
  render: () => <ServerSearchRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Organization" });

    await expect(input).toHaveValue("Organization 1999");
    await expect(canvas.getByTestId("server-query")).toHaveTextContent("Remote query: (empty)");
    await userEvent.click(input);
    await expect(input).toHaveValue("Organization 1999");
    await expect(canvas.getByTestId("server-selected-value")).toBeInTheDocument();
    await expect(canvas.getByTestId("server-query")).toHaveTextContent("Remote query: (empty)");
    await expect(input).toHaveAttribute("placeholder", "Select organization...");

    await userEvent.type(input, "Organization 2");
    await expect(input).toHaveValue("Organization 2");
    await expect(canvas.queryByTestId("server-selected-value")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("server-query")).toHaveTextContent(
      "Remote query: Organization 2"
    );
    await expect(getTrailingSlot(input)).toHaveAttribute("data-state", "loading");
    await waitFor(() => expect(getTrailingSlot(input)).toHaveAttribute("data-state", "clear"));
    clickOpenTrailingClear(input);
    await waitFor(() => expect(input).toHaveValue(""));
    await expect(canvas.getByTestId("server-query")).toHaveTextContent("Remote query: (empty)");
    await expect(canvas.getByTestId("server-callback-counts")).toHaveTextContent(
      "Value changes: 0; clear overrides: 1"
    );
  }
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
            <p className="text-xs text-muted">{option.items} assigned members</p>
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
    <div>
      <Field>
        <FieldLabel id="combobox-projects-label" htmlFor="combobox-projects">
          Projects
        </FieldLabel>
        <StoryCombobox
          id="combobox-projects"
          aria-labelledby="combobox-projects-label"
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
      <p className="sr-only">Selected projects: {value.length}</p>
    </div>
  );
};

/**
 * Multiple mode composes Base UI's chips and input. Arrow keys move between chips,
 * Backspace/Delete remove them, and selection leaves the popup open with the
 * search input cleared and focused.
 */
export const Multiple: Story = {
  name: "Example: Multiple Selection",
  render: () => <MultipleRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole("combobox", { name: "Projects" });

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Project 1 with a long descriptive name" })
    );
    await expect(
      canvas.queryByRole("button", { name: "Remove Project 1 with a long descriptive name" })
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Remove Project 2" })).toBeInTheDocument();
    await userEvent.click(canvas.getByText("Projects"));
    await userEvent.type(combobox, "Project 3");
    await expect(combobox).toHaveFocus();
    await expect(combobox).toHaveAccessibleName("Projects");
    await expect(getTrailingSlot(combobox)).toHaveAttribute("data-state", "clear");
    clickOpenTrailingClear(combobox);
    await expect(canvas.queryByRole("button", { name: /Remove Project/ })).not.toBeInTheDocument();
    await waitFor(() => expect(combobox).toHaveValue(""));
    await expect(getTrailingSlot(combobox)).toHaveAttribute("data-state", "chevron");
  }
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

export const ChipLayouts: Story = {
  name: "Example: Chip Layouts",
  parameters: {
    docs: {
      description: {
        story:
          "Use the default wrapped layout when every selection should stay visible within a bounded scroll area. Use `singleLine` when the field must keep text-input height and horizontal overflow is preferable."
      }
    }
  },
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <OverflowedSelectionsRender />
      <SingleLineRender />
    </div>
  )
};

const NestedDialogCreationField = () => {
  const [options, setOptions] = useState<string[]>([]);
  const [value, setValue] = useState<string | null>(null);

  return (
    <Field>
      <FieldLabel htmlFor="combobox-nested-dialog-tag">Primary tag</FieldLabel>
      <StoryCombobox
        id="combobox-nested-dialog-tag"
        modal
        options={options}
        value={value}
        onValueChange={setValue}
        getOptionValue={(option) => option}
        getOptionLabel={(option) => option}
        placeholder="Select or create a tag..."
        creation={{
          mode: "dialog",
          title: "Create Nested Tag",
          description: "Confirm the tag before adding it to this invitation.",
          renderForm: ({ initialInput, complete, cancel }) => (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setOptions((current) => [...current, initialInput]);
                setValue(initialInput);
                complete();
              }}
            >
              <Field>
                <FieldLabel htmlFor="nested-dialog-tag-name">Tag name</FieldLabel>
                <Input id="nested-dialog-tag-name" defaultValue={initialInput} autoFocus />
              </Field>
              <DialogFooter>
                <Button variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit">Create Tag</Button>
              </DialogFooter>
            </form>
          )
        }}
      />
      <p className="text-sm text-muted">Created tag: {value ?? "none"}</p>
    </Field>
  );
};

const InDialogRender = () => {
  const [value, setValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(
    ORGANIZATION_ROLES[1]
  );
  const [parentSubmitCount, setParentSubmitCount] = useState(0);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Role Picker</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setParentSubmitCount((current) => current + 1);
          }}
        >
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
          <NestedDialogCreationField />
          <p role="status">Parent form submits: {parentSubmitCount}</p>
        </form>
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
          "Set `modal` when the combobox is rendered inside a modal Dialog. Base UI then preserves focus containment and scroll access for its body-portalled option list. A dialog creation form stops its submit event at the shared creation-dialog boundary, so React portal propagation cannot submit an ancestor form."
      }
    }
  },
  render: () => <InDialogRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open Role Picker" }));
    const parentDialog = await body.findByRole("dialog", { name: "Invite Organization Member" });
    const roleInput = within(parentDialog).getByRole("combobox", { name: "Organization role" });
    const roleClear = within(parentDialog).getByRole("button", { name: "Clear selection" });
    roleClear.focus();
    await expect(roleClear).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(roleInput).toHaveValue(""));

    const input = within(parentDialog).getByRole("combobox", { name: "Primary tag" });
    await userEvent.click(input);
    await userEvent.type(input, "Enter tag");
    await userEvent.click(body.getByRole("option", { name: 'Create "Enter tag"' }));
    const creationDialog = await body.findByRole("dialog", { name: "Create Nested Tag" });
    await expect(within(creationDialog).getByLabelText("Tag name")).toHaveValue("Enter tag");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Create Nested Tag" })).not.toBeInTheDocument()
    );
    await expect(
      body.getByRole("dialog", { name: "Invite Organization Member" })
    ).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveValue("Enter tag");
    await expect(within(parentDialog).getByText("Parent form submits: 0")).toBeInTheDocument();
    await userEvent.click(within(parentDialog).getByRole("button", { name: "Clear selection" }));
    await waitFor(() => expect(input).toHaveValue(""));

    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "Button tag");
    await userEvent.click(body.getByRole("option", { name: 'Create "Button tag"' }));
    const buttonCreationDialog = await body.findByRole("dialog", { name: "Create Nested Tag" });
    await userEvent.click(within(buttonCreationDialog).getByRole("button", { name: "Create Tag" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Create Nested Tag" })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveValue("Button tag");
    await expect(within(parentDialog).getByText("Created tag: Button tag")).toBeInTheDocument();
    await expect(within(parentDialog).getByText("Parent form submits: 0")).toBeInTheDocument();
    const nestedClear = within(parentDialog).getByRole("button", { name: "Clear selection" });
    nestedClear.focus();
    await expect(nestedClear).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(input).toHaveValue(""));
  }
};

const StatesRender = () => {
  const [loadingSingleValue, setLoadingSingleValue] = useState<
    (typeof ENVIRONMENTS)[number] | null
  >(ENVIRONMENTS[0]);
  const [loadingMultipleValue, setLoadingMultipleValue] = useState<(typeof PROJECTS)[number][]>(
    PROJECTS.slice(0, 2)
  );

  return (
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
        <FieldLabel htmlFor="combobox-non-clearable">Required environment</FieldLabel>
        <StoryCombobox
          id="combobox-non-clearable"
          options={ENVIRONMENTS}
          value={ENVIRONMENTS[0]}
          onValueChange={() => undefined}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          isClearable={false}
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
        <FieldLabel htmlFor="combobox-loading">Loading environment</FieldLabel>
        <StoryCombobox
          id="combobox-loading"
          options={ENVIRONMENTS}
          value={loadingSingleValue}
          onValueChange={setLoadingSingleValue}
          getOptionValue={(option: (typeof ENVIRONMENTS)[number]) => option.id}
          getOptionLabel={(option) => option.name}
          isLoading
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="combobox-loading-projects">Loading projects</FieldLabel>
        <StoryCombobox
          id="combobox-loading-projects"
          multiple
          options={PROJECTS}
          value={loadingMultipleValue}
          onValueChange={(nextValue) => setLoadingMultipleValue(nextValue)}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          isLoading
        />
      </Field>
    </div>
  );
};

export const States: Story = {
  render: () => <StatesRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const disabledSingle = canvasElement.querySelector<HTMLElement>("#combobox-disabled")!;
    const nonClearableSingle = canvas.getByRole("combobox", { name: "Required environment" });
    const disabledMultiple = canvas.getByRole("combobox", { name: "Projects", hidden: true });
    const loadingSingle = canvas.getByRole("combobox", { name: "Loading environment" });
    const loadingMultiple = canvas.getByRole("combobox", { name: "Loading projects" });

    await expect(getTrailingSlot(disabledSingle)).toHaveAttribute("data-state", "chevron");
    await expect(getTrailingSlot(nonClearableSingle)).toHaveAttribute("data-state", "chevron");
    await expect(getTrailingSlot(disabledMultiple)).toHaveAttribute("data-state", "chevron");
    await expect(canvas.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Clear all selections" })
    ).not.toBeInTheDocument();
    await expect(getTrailingSlot(loadingSingle)).toHaveAttribute("data-state", "loading");
    await expect(getTrailingSlot(loadingMultiple)).toHaveAttribute("data-state", "loading");
  }
};

const ViewportEdgesRender = () => {
  const [topValue, setTopValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(null);
  const [bottomValue, setBottomValue] = useState<(typeof ORGANIZATION_ROLES)[number] | null>(null);

  const renderCombobox = (
    id: string,
    value: (typeof ORGANIZATION_ROLES)[number] | null,
    onValueChange: (option: (typeof ORGANIZATION_ROLES)[number] | null) => void
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

const SingleDismissedFailureRender = () => {
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [value, setValue] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="combobox-single-dismissed-failure">Environment</FieldLabel>
        <StoryCombobox
          id="combobox-single-dismissed-failure"
          options={options}
          value={value}
          onValueChange={setValue}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          placeholder="Select or create an environment..."
          creation={{
            onCreate: async (inputValue) => {
              await sleep(500);
              if (attempt === 0) {
                setAttempt(1);
                throw false;
              }
              const option = { id: inputValue, name: inputValue };
              setOptions([option]);
              setValue(option);
            }
          }}
        />
      </Field>
      <Button variant="outline">Continue</Button>
      <p role="status">{value ? `Selected ${value.name}` : "No selection"}</p>
    </div>
  );
};

export const SingleDismissedFailure: Story = {
  name: "Creation: Single Dismissed Failure and Retry",
  parameters: {
    docs: {
      description: {
        story:
          "A rejected single-value creation retains its failed query and inline error after pending work was dismissed. Reopening allows the same query to be retried without restoring focus or opening automatically."
      }
    }
  },
  render: () => <SingleDismissedFailureRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Environment" });
    const continueButton = canvas.getByRole("button", { name: "Continue" });

    await userEvent.click(input);
    await userEvent.type(input, "retryable");
    await userEvent.click(canvas.getByRole("option", { name: 'Create "retryable"' }));
    await expect(getTrailingSlot(input)).toHaveAttribute("data-state", "loading");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(continueButton);
    await sleep(600);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(continueButton).toHaveFocus();

    await userEvent.click(input);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      'Could not create "retryable"'
    );
    await expect(input).toHaveValue("retryable");
    await userEvent.click(canvas.getByRole("option", { name: /Create "retryable"/ }));
    await expect(await canvas.findByText("Selected retryable")).toBeInTheDocument();
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toHaveValue("retryable");
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

export const InlineCreation: Story = {
  name: "Example: Inline Creation",
  parameters: {
    docs: {
      description: {
        story:
          "Inline creation is the compact path for values that need no extra metadata. The single-select example persists immediately; the multi-select example validates a slug, exposes caller-owned pending and failure copy, and updates controlled options and selections only after persistence succeeds."
      }
    }
  },
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <CreatableSingleRender />
      <AsyncCreationRender />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const environmentInput = canvas.getByRole("combobox", { name: "Environment" });
    const tagsInput = canvas.getByRole("combobox", { name: "Tags" });

    await userEvent.click(environmentInput);
    await expect(canvas.getByRole("option", { name: "Create" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await userEvent.type(environmentInput, "prod");
    await expect(canvas.getByRole("option", { name: "Production" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("option", { name: 'Create "prod"' }));
    await expect(environmentInput).toHaveValue("prod");

    await userEvent.click(tagsInput);
    await userEvent.type(tagsInput, "release-ready");
    await userEvent.click(canvas.getByRole("option", { name: 'Create tag "release-ready"' }));
    await expect(
      canvas.getByRole("option", { name: 'Creating tag "release-ready"...' })
    ).toHaveAttribute("aria-disabled", "true");
    await expect(getTrailingSlot(tagsInput)).toHaveAttribute("data-state", "loading");
    await expect(
      canvas.queryByRole("button", { name: "Clear all selections" })
    ).not.toBeInTheDocument();
    await expect(
      await canvas.findByRole("button", { name: "Remove release-ready" })
    ).toBeInTheDocument();
    await expect(getTrailingSlot(tagsInput)).toHaveAttribute("data-state", "clear");

    await userEvent.type(tagsInput, "reserved");
    await userEvent.click(canvas.getByRole("option", { name: 'Create tag "reserved"' }));
    await userEvent.keyboard("{Escape}");
    await sleep(450);
    await userEvent.click(tagsInput);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The tag could not be created"
    );
    await expect(canvas.queryByText("No options found.")).not.toBeInTheDocument();
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
      canvas.getByRole("option", { name: 'Use member email "member@example.com"' })
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.clear(input);
    await userEvent.type(input, "new.member@example.com");
    await expect(
      canvas.getByRole("option", { name: 'Use member email "new.member@example.com"' })
    ).not.toHaveAttribute("aria-disabled", "true");
  }
};

type MetadataTagOption = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

type MetadataTagFormProps = ComboboxDialogCreationRenderProps & {
  onCreate: (option: Omit<MetadataTagOption, "id">) => Promise<void>;
  onPendingChange: (isPending: boolean) => void;
};

const toSlug = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const MetadataTagForm = ({
  initialInput,
  complete,
  cancel,
  onCreate,
  onPendingChange
}: MetadataTagFormProps) => {
  const [name, setName] = useState(initialInput);
  const [slug, setSlug] = useState(() => toSlug(initialInput));
  const [description, setDescription] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isValid = Boolean(name.trim() && /^[a-z][a-z0-9-]*$/.test(slug));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid || isPending) return;

    setError(null);
    setIsPending(true);
    onPendingChange(true);
    try {
      await onCreate({ name: name.trim(), slug, description: description.trim() });
      complete();
    } catch {
      setError("That slug is reserved. Choose another slug and try again.");
    } finally {
      setIsPending(false);
      onPendingChange(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="dialog-tag-name">Name</FieldLabel>
        <Input
          id="dialog-tag-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Field>
      <Field data-invalid={Boolean(slug) && !isValid ? "true" : undefined}>
        <FieldLabel htmlFor="dialog-tag-slug">Slug</FieldLabel>
        <Input
          id="dialog-tag-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          aria-invalid={Boolean(slug) && !isValid ? true : undefined}
        />
        {slug && !isValid && <FieldError>Use lowercase letters, numbers, and hyphens.</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor="dialog-tag-description">Description</FieldLabel>
        <TextArea
          id="dialog-tag-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Explain when this tag should be used."
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={cancel} isDisabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" isDisabled={!isValid} isPending={isPending}>
          Create Tag
        </Button>
      </DialogFooter>
    </form>
  );
};

const MetadataOptionDetails = ({ option }: { option: MetadataTagOption }) => (
  <dl
    aria-label={`${option.name} metadata`}
    className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
  >
    <dt className="text-muted">ID</dt>
    <dd>{option.id}</dd>
    <dt className="text-muted">Name</dt>
    <dd>{option.name}</dd>
    <dt className="text-muted">Slug</dt>
    <dd>{option.slug}</dd>
    <dt className="text-muted">Description</dt>
    <dd>{option.description || "No description"}</dd>
  </dl>
);

const renderMetadataOption = (option: MetadataTagOption) => (
  <div className="min-w-0">
    <p className="truncate">{option.name}</p>
    <p className="truncate text-xs text-muted">{option.slug}</p>
    <p className="text-xs leading-4 break-words whitespace-normal text-muted">
      {option.description || "No description"}
    </p>
  </div>
);

function SingleDialogCreationRender({ modal = false }: { modal?: boolean }) {
  const [options, setOptions] = useState<MetadataTagOption[]>([]);
  const [value, setValue] = useState<MetadataTagOption | null>(null);
  const [isPending, setIsPending] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="combobox-dialog-primary-tag">Primary tag</FieldLabel>
        <StoryCombobox
          id="combobox-dialog-primary-tag"
          modal={modal}
          options={options}
          value={value}
          onValueChange={setValue}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          getOptionKeywords={(option) => [option.slug, option.description]}
          renderOption={renderMetadataOption}
          placeholder="Select or create a primary tag..."
          creation={{
            mode: "dialog",
            title: "Create Tag",
            description: "Add a reusable tag with the metadata your team needs.",
            isPending,
            renderForm: (props) => (
              <MetadataTagForm
                {...props}
                onPendingChange={setIsPending}
                onCreate={async (fields) => {
                  await sleep(450);
                  if (fields.slug === "reserved") throw new Error("Reserved slug");
                  const option = { id: `tag-${fields.slug}`, ...fields };
                  setOptions((current) => [...current, option]);
                  setValue(option);
                }}
              />
            )
          }}
        />
      </Field>
      {value && <MetadataOptionDetails option={value} />}
    </div>
  );
}

const MultipleDialogCreationRender = () => {
  const [options, setOptions] = useState<MetadataTagOption[]>([]);
  const [value, setValue] = useState<MetadataTagOption[]>([]);
  const [isPending, setIsPending] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="combobox-dialog-additional-tags">Additional tags</FieldLabel>
        <StoryCombobox
          id="combobox-dialog-additional-tags"
          multiple
          options={options}
          value={value}
          onValueChange={setValue}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          getOptionKeywords={(option) => [option.slug, option.description]}
          renderOption={renderMetadataOption}
          placeholder="Select or create additional tags..."
          creation={{
            mode: "dialog",
            title: "Create Tag",
            description: "Add a reusable tag with the metadata your team needs.",
            isPending,
            renderForm: (props) => (
              <MetadataTagForm
                {...props}
                onPendingChange={setIsPending}
                onCreate={async (fields) => {
                  await sleep(450);
                  if (fields.slug === "reserved") throw new Error("Reserved slug");
                  const option = { id: `tag-${fields.slug}`, ...fields };
                  setOptions((current) => [...current, option]);
                  setValue((current) => [...current, option]);
                }}
              />
            )
          }}
        />
      </Field>
      {value.map((option) => (
        <MetadataOptionDetails key={option.id} option={option} />
      ))}
    </div>
  );
};

export const DialogCreation: Story = {
  name: "Example: Dialog Creation",
  parameters: {
    docs: {
      description: {
        story:
          'Use `creation.mode = "dialog"` when a new option needs metadata beyond the search query. The caller renders and validates the form, persists a complete domain object, updates controlled options and selection, then calls `complete`. Cancel preserves the query for retry; `isPending` blocks Escape, outside click, and close controls until persistence settles.'
      }
    }
  },
  render: () => (
    <div className="flex w-80 flex-col gap-8">
      <SingleDialogCreationRender />
      <MultipleDialogCreationRender />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const primaryInput = canvas.getByRole("combobox", { name: "Primary tag" });
    const additionalInput = canvas.getByRole("combobox", { name: "Additional tags" });

    await userEvent.click(primaryInput);
    await userEvent.type(primaryInput, "Release workflow");
    await userEvent.click(canvas.getByRole("option", { name: 'Create "Release workflow"' }));
    let dialog = await body.findByRole("dialog", { name: "Create Tag" });
    await expect(within(dialog).getByLabelText("Name")).toHaveValue("Release workflow");
    const slugInput = within(dialog).getByLabelText("Slug");
    const createButton = within(dialog).getByRole("button", { name: "Create Tag" });
    await userEvent.clear(slugInput);
    await expect(createButton).toBeDisabled();
    await userEvent.type(slugInput, "release-workflow");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Create Tag" })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(primaryInput).toHaveFocus());
    await expect(primaryInput).toHaveValue("Release workflow");
    await expect(primaryInput).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(canvas.getByRole("option", { name: 'Create "Release workflow"' }));
    dialog = await body.findByRole("dialog", { name: "Create Tag" });
    await userEvent.type(
      within(dialog).getByLabelText("Description"),
      "Coordinates checks before production deployment."
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Create Tag" }));
    await expect(within(dialog).getByRole("button", { name: "Create Tag" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    await userEvent.keyboard("{Escape}");
    await expect(body.getByRole("dialog", { name: "Create Tag" })).toBeInTheDocument();
    const primaryMetadata = await canvas.findByLabelText("Release workflow metadata");
    await expect(within(primaryMetadata).getByText("tag-release-workflow")).toBeInTheDocument();
    await expect(
      within(primaryMetadata).getByText("Coordinates checks before production deployment.")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Create Tag" })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(primaryInput).toHaveFocus());
    await expect(primaryInput).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(additionalInput);
    await userEvent.type(additionalInput, "Security review");
    await userEvent.click(canvas.getByRole("option", { name: 'Create "Security review"' }));
    dialog = await body.findByRole("dialog", { name: "Create Tag" });
    await userEvent.clear(within(dialog).getByLabelText("Slug"));
    await userEvent.type(within(dialog).getByLabelText("Slug"), "reserved");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create Tag" }));
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent("slug is reserved");
    await userEvent.clear(within(dialog).getByLabelText("Slug"));
    await userEvent.type(within(dialog).getByLabelText("Slug"), "security-review");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create Tag" }));
    await expect(
      await canvas.findByRole("button", { name: "Remove Security review" })
    ).toBeInTheDocument();
    const additionalMetadata = await canvas.findByLabelText("Security review metadata");
    await expect(within(additionalMetadata).getByText("tag-security-review")).toBeInTheDocument();
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
        onSearchChange={setQuery}
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
          "Creation composes with grouped, caller-filtered multi-select results. The fixed Create footer stays outside domain groups and Select All counts only real options, and successful creation resets the caller-owned query so refreshed results remain visible."
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
    await expect(canvas.getByRole("option", { name: 'Create "prod"' })).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await userEvent.click(canvas.getByRole("button", { name: "Select All (1)" }));
    await expect(canvas.getByRole("button", { name: "Remove production" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Remove prod" })).not.toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "remote-created");
    await expect(canvas.queryByText("No options found.")).not.toBeInTheDocument();
    const createOption = canvas.getByRole("option", { name: 'Create "remote-created"' });
    await userEvent.keyboard("{ArrowDown}");
    await expect(createOption).toHaveAttribute("data-highlighted");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("button", { name: "Remove remote-created" })).toBeInTheDocument();
    await expect(input).toHaveValue("");
    await expect(canvas.getByRole("option", { name: /production/ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Select All (5)" })).toBeInTheDocument();
  }
};
