import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications/Notifications";
import { Drawer, DrawerContent, DrawerTrigger } from "@app/components/v2/Drawer";
import { Modal, ModalContent, ModalTrigger } from "@app/components/v2/Modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@app/components/v3/generic/AlertDialog";
import { Button } from "@app/components/v3/generic/Button";
import { Combobox } from "@app/components/v3/generic/Combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@app/components/v3/generic/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3/generic/Dropdown";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@app/components/v3/generic/HoverCard";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@app/components/v3/generic/Sheet";
import { Toaster } from "@app/components/v3/generic/Toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";

const environments = [
  { label: "Development", value: "dev" },
  { label: "Production", value: "prod" }
];

const formatEnvironmentOption = (
  option: (typeof environments)[number],
  { context }: { context: "menu" | "value" }
) => (
  <span className="flex items-center gap-2">
    {option.label}
    {context === "menu" && (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={`About ${option.label}`}>
            <InfoIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Access to secrets in {option.label.toLowerCase()}.</TooltipContent>
      </Tooltip>
    )}
  </span>
);

function OverlayControls() {
  const [environment, setEnvironment] = useState<(typeof environments)[number] | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Select defaultValue="dev">
        <SelectTrigger aria-label="Environment">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dev">Development</SelectItem>
          <SelectItem value="prod">Production</SelectItem>
        </SelectContent>
      </Select>
      <Combobox
        aria-label="Search environments"
        options={environments}
        value={environment}
        onValueChange={setEnvironment}
        getOptionValue={(option) => option.value}
        getOptionLabel={(option) => option.label}
        placeholder="Select environment"
      />
      <FilterableSelect
        aria-label="Additional privileges"
        options={environments}
        formatOptionLabel={formatEnvironmentOption}
      />
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Access Actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                  Revoke Access
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Revoke Access</AlertDialogTitle>
                <AlertDialogDescription>
                  The member will lose access to this environment.
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="danger">Revoke Access</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Access Details</Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="mb-3 text-sm">Review the environment before changing access.</p>
          </PopoverContent>
        </Popover>
        <HoverCard>
          <HoverCardTrigger asChild>
            <Button variant="ghost">Member Details</Button>
          </HoverCardTrigger>
          <HoverCardContent>Member of the platform team.</HoverCardContent>
        </HoverCard>
      </div>
    </div>
  );
}

function NestedDialog({ depth = 1 }: { depth?: number }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Review Access {depth}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Review Access {depth}</DialogTitle>
        <DialogDescription>Inspect related access before confirming this change.</DialogDescription>
        <OverlayControls />
        <NestedDialog depth={depth + 1} />
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: "Foundations/Overlay Layering",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Shared layering across v2 and v3. Check pointer and keyboard interaction at laptop and narrow widths. Menus escape scroll clipping, tooltips remain above their menu, and each confirmation covers its owner. Reopen sibling overlays in reverse order to verify opening order."
      }
    }
  },
  tags: ["autodocs"]
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const DialogComposition: Story = {
  name: "Example: Dialog and Repeated Nesting",
  render: () => (
    <div className="flex gap-2">
      <NestedDialog />
      <NestedDialog />
    </div>
  )
};

export const SheetComposition: Story = {
  name: "Example: Scrollable Sheet",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Manage Access</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Manage Access</SheetTitle>
          <SheetDescription>Choose environments and review member access.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <OverlayControls />
          <div className="h-[60vh]" />
          <OverlayControls />
          <NestedDialog />
        </div>
      </SheetContent>
    </Sheet>
  )
};

export const LegacyComposition: Story = {
  name: "Example: Legacy Modal and Drawer Parity",
  render: () => (
    <div className="flex gap-2">
      <Modal>
        <ModalTrigger asChild>
          <Button>Legacy Create Flow</Button>
        </ModalTrigger>
        <ModalContent
          title="Create Data Source"
          subTitle="Choose an environment for this data source."
        >
          <OverlayControls />
          <NestedDialog />
        </ModalContent>
      </Modal>
      <Drawer>
        <DrawerTrigger asChild>
          <Button>Legacy Secret Details</Button>
        </DrawerTrigger>
        <DrawerContent title="Secret Details">
          <OverlayControls />
          <NestedDialog />
        </DrawerContent>
      </Drawer>
    </div>
  )
};

export const ToastComposition: Story = {
  name: "Example: Toast Actions and Tooltip",
  render: () => (
    <div className="flex gap-2">
      <Toaster />
      <NestedDialog />
      <Button
        onClick={() =>
          createNotification(
            {
              type: "error",
              title: "Access Update Failed",
              text: "Review the request details and try again.",
              copyActions: [{ name: "Request ID", value: "request-example" }],
              callToAction: <NestedDialog />
            },
            { autoClose: false }
          )
        }
      >
        Show Error Details
      </Button>
    </div>
  )
};
