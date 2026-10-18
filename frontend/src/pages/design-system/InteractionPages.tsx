import { useState } from "react";

import { AnimatedCollapse } from "@app/components/v4/ui/animated-collapse";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@app/components/v4/ui/dialog";
import { Input } from "@app/components/v4/ui/input";
import { Label } from "@app/components/v4/ui/label";

import { DensityBoard } from "./DensityBoards";
import { DocDisclosure, DocSection, PageHeading, PreviewFrame } from "./doc-parts";
import { tokens } from "./foundation-data";

export const MotionPage = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeading title="Motion" />
      <PreviewFrame>
        <div className="flex w-full flex-col gap-4">
          <Button
            variant="outline"
            aria-expanded={open}
            aria-controls="motion-details"
            onClick={() => setOpen(!open)}
          >
            Connection details
          </Button>
          <AnimatedCollapse open={open} id="motion-details">
            <p>12 versions are synchronized.</p>
          </AnimatedCollapse>
        </div>
      </PreviewFrame>
      <DocSection title="Motion tokens">
        <p className="text-muted-foreground mb-4 text-sm leading-6">{tokens.motion.note}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {tokens.motion.tokens.map((token) => (
            <div key={token.name} className="border border-border p-4">
              <code className="text-xs">{token.name}</code>
              <p className="text-muted-foreground mt-1 font-mono text-xs">{token.value}</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{token.usage}</p>
            </div>
          ))}
        </div>
      </DocSection>
      <DocDisclosure title="Usage and rules">
        <div className="flex flex-col gap-5 text-sm leading-6">
          <section>
            <h2 className="font-medium">Keep the operation clear</h2>
            <p className="mt-2">
              Use motion when a panel enters, expands or leaves. Keep the action label and geometry
              stable while a request is pending. A status message must explain progress even when
              animation is disabled. Hidden content leaves the keyboard sequence when collapsed.
            </p>
          </section>
          <section>
            <h2 className="font-medium">Reduced motion</h2>
            <p className="mt-2">
              Respect the operating system preference. Remove spatial movement from disclosure
              transitions and preserve the final state, focus, labels and results. Never require an
              animation to finish before accepting input.
            </p>
            <a className="mt-4 inline-block underline" href="#animated-collapse">
              Inspect the disclosure example
            </a>
          </section>
        </div>
      </DocDisclosure>
    </div>
  );
};

export const FocusPage = () => (
  <div>
    <PageHeading title="Focus and keyboard" />
    <PreviewFrame>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Edit connection</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Edit connection</DialogTitle>
          <DialogDescription>
            Review the hostname used to connect to this service.
          </DialogDescription>
          <Label htmlFor="focus-host">Hostname</Label>
          <Input id="focus-host" defaultValue="vault.example.test" />
        </DialogContent>
      </Dialog>
    </PreviewFrame>
    <DocDisclosure title="Usage and rules">
      <div className="flex flex-col gap-5 text-sm leading-6">
        <section>
          <h2 className="font-medium">Follow the owner</h2>
          <p className="mt-2">
            A modal owns its keyboard sequence while open. Menus and listboxes use their own
            arrow-key model. Keep names, labels and descriptions with the actual control. Do not add
            a second document-wide Escape handler around a Radix overlay. In this example, Tab stays
            inside the dialog and Escape returns to its trigger.
          </p>
        </section>
        <section>
          <h2 className="font-medium">Show the current place</h2>
          <p className="mt-2">
            Focus and selection have different jobs. Focus shows where the next keyboard action
            goes. Selection shows the current value or range. Both must remain visible when a
            control is selected and focused together.
          </p>
        </section>
        <section>
          <h2 className="font-medium">Check the exit</h2>
          <p className="mt-2">
            Close a nested overlay before its parent and verify focus after the exit completes. If
            the trigger disappears during the action, provide a meaningful next focus target. Check
            scrolled content so outlines are not clipped.
          </p>
        </section>
      </div>
    </DocDisclosure>
  </div>
);

export const DensityPage = () => (
  <div>
    <PageHeading title="Density" />
    <div className="flex flex-col gap-12">
      <DensityBoard compact />
      <DensityBoard compact={false} />
    </div>
    <DocDisclosure title="Usage and rules">
      <div className="flex flex-col gap-4 text-sm leading-6">
        <p>
          Default controls use the slightly denser 32px height with 14px labels. Explicit md
          controls retain 36px and lg retains 40px. Keep labels readable. A narrow viewport changes
          wrapping before it changes the size of a control.
        </p>
        <p>
          Compare the same content, states and adjacent parts. Standalone actions and nested field
          actions have different slots. Technical grids keep their deliberate cell density. Do not
          force every component to the same height.
        </p>
        <p>
          Use quiet open groups. Frame data, code and distinct tasks. Keep control borders inside
          the measured box so filled and outlined actions align.
        </p>
      </div>
    </DocDisclosure>
  </div>
);
