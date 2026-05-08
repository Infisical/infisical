import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { Stepper, StepperList, StepperStep } from "./Stepper";

/**
 * Stepper renders an ordered set of steps with per-step status (complete,
 * current, pending, error) connected by a rail. Use it as the side panel of
 * a multi-step setup flow (e.g. Secret Sync creation), where the user moves
 * through a fixed sequence of stages. The stepper is a pure progress
 * indicator — consumers render their own panel content next to it.
 *
 * Pass `onStepChange` to make completed steps clickable for back-navigation;
 * pending steps stay non-interactive so users can't skip ahead past required
 * input.
 */
const meta = {
  title: "Generic/Stepper",
  component: Stepper,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    activeStep: 0
  },
  argTypes: {
    children: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

const SETUP_STEPS = [
  { title: "Provider", description: "Where to sync to" },
  { title: "Source", description: "Pick env and path" },
  { title: "Destination", description: "Connect provider" },
  { title: "Sync Options", description: "Behavior + advanced" },
  { title: "Details", description: "Name + description" },
  { title: "Review", description: "Confirm" }
] as const;

function VerticalRender() {
  const [step, setStep] = useState(1);
  return (
    <div className="flex w-[260px] flex-col gap-4">
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">Setup steps</p>
      <Stepper activeStep={step} onStepChange={setStep}>
        <StepperList>
          {SETUP_STEPS.map((s, i) => (
            <StepperStep key={s.title} index={i} title={s.title} description={s.description} />
          ))}
        </StepperList>
      </Stepper>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        <Button
          variant="project"
          size="sm"
          onClick={() => setStep((s) => Math.min(SETUP_STEPS.length - 1, s + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export const Vertical: Story = {
  name: "Example: Vertical",
  parameters: {
    docs: {
      description: {
        story:
          "Default vertical layout used as a wizard sidebar. Completed steps show a green checkmark, the current step is ringed in warning yellow, pending steps are dimmed. Click Back/Next to advance — completed steps become clickable for back-navigation."
      }
    }
  },
  render: () => <VerticalRender />
};

function HorizontalRender() {
  const [step, setStep] = useState(2);
  return (
    <div className="flex w-[640px] flex-col gap-6">
      <Stepper activeStep={step} orientation="horizontal" onStepChange={setStep}>
        <StepperList>
          {SETUP_STEPS.slice(0, 4).map((s, i) => (
            <StepperStep key={s.title} index={i} title={s.title} description={s.description} />
          ))}
        </StepperList>
      </Stepper>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        <Button variant="project" size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))}>
          Next
        </Button>
      </div>
    </div>
  );
}

export const Horizontal: Story = {
  name: "Example: Horizontal",
  parameters: {
    docs: {
      description: {
        story:
          "Horizontal orientation for top-of-page wizards or short flows. Indicators sit above the labels and are connected by a horizontal rail."
      }
    }
  },
  render: () => <HorizontalRender />
};

function ErrorStateRender() {
  return (
    <div className="w-[260px]">
      <Stepper activeStep={3}>
        <StepperList>
          <StepperStep index={0} title="Provider" description="Where to sync to" />
          <StepperStep index={1} title="Source" description="Pick env and path" />
          <StepperStep index={2} title="Destination" description="Connect provider" />
          <StepperStep
            index={3}
            title="Sync Options"
            description="Missing required field"
            status="error"
          />
          <StepperStep index={4} title="Details" description="Name + description" />
          <StepperStep index={5} title="Review" description="Confirm" />
        </StepperList>
      </Stepper>
    </div>
  );
}

export const ErrorState: Story = {
  name: "Example: Error step",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `status="error"` on a step that has a validation failure — the indicator switches to the danger color with an alert icon, and the title turns danger-colored. Use this when the user has visited a step but failed to satisfy its requirements before advancing.'
      }
    }
  },
  render: () => <ErrorStateRender />
};

function StaticRender() {
  return (
    <div className="w-[260px]">
      <Stepper activeStep={2}>
        <StepperList>
          <StepperStep index={0} title="Initialize" description="Create the workspace" />
          <StepperStep index={1} title="Configure" description="Set defaults" />
          <StepperStep index={2} title="Deploy" description="Push to environment" />
          <StepperStep index={3} title="Verify" description="Run smoke tests" />
        </StepperList>
      </Stepper>
    </div>
  );
}

export const Static: Story = {
  name: "Example: Read-only",
  parameters: {
    docs: {
      description: {
        story:
          "Without `onStepChange`, the stepper is purely visual — useful for status displays where the user can't navigate (e.g. a deployment progress card)."
      }
    }
  },
  render: () => <StaticRender />
};
