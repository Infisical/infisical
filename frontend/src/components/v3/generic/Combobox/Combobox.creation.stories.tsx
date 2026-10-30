import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { Combobox, type ComboboxFormCreationRenderProps } from ".";
import { DiscardChangesAlertDialog } from "../AlertDialog/DiscardChangesAlertDialog";
import { Button } from "../Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../Dialog";
import { Field, FieldLabel } from "../Field";
import { Input } from "../Input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "../Sheet";
import { Stepper, StepperList, StepperStep } from "../Stepper";

type Profile = { id: string; name: string };
const PROFILES: Profile[] = [{ id: "existing", name: "Existing Profile" }];
const ISSUERS: Profile[] = [
  { id: "internal", name: "Internal CA" },
  { id: "external", name: "External CA" }
];
const STEPS = ["Details", "Issuer", "Review"];

type ProfileFormProps = ComboboxFormCreationRenderProps & {
  showHeader: boolean;
  isPending: boolean;
  onPendingChange: (pending: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onCreated: (profile: Profile) => void;
};

const ProfileForm = ({
  initialInput,
  complete,
  cancel,
  showHeader,
  isPending,
  onPendingChange,
  onDirtyChange,
  onCreated
}: ProfileFormProps) => {
  const [name, setName] = useState(initialInput);
  const [issuer, setIssuer] = useState<Profile | null>(null);
  const [step, setStep] = useState(0);

  const finishSave = () => {
    onCreated({ id: name.trim(), name: name.trim() });
    onDirtyChange(false);
    onPendingChange(false);
    complete();
  };

  return (
    <>
      {!showHeader && (
        <SheetHeader>
          <SheetTitle>Create Certificate Profile</SheetTitle>
          <SheetDescription>
            Configure a profile before attaching it to the application.
          </SheetDescription>
        </SheetHeader>
      )}
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 2 && !isPending) onPendingChange(true);
        }}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="w-60 shrink-0 border-r border-border p-4">
            <Stepper
              activeStep={step}
              onStepChange={(nextStep) => {
                if (!isPending) setStep(nextStep);
              }}
            >
              <StepperList>
                {STEPS.map((title, index) => (
                  <StepperStep key={title} index={index} title={title} />
                ))}
              </StepperList>
            </Stepper>
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <h2 className="mb-6 font-alliance text-lg">{STEPS[step]}</h2>
            {step === 0 && (
              <Field>
                <FieldLabel htmlFor="profile-name">Profile Name</FieldLabel>
                <Input
                  id="profile-name"
                  value={name}
                  disabled={isPending}
                  onChange={(event) => {
                    setName(event.target.value);
                    onDirtyChange(true);
                  }}
                />
              </Field>
            )}
            {step === 1 && (
              <Field>
                <FieldLabel htmlFor="profile-issuer">Issuing CA</FieldLabel>
                <Combobox
                  id="profile-issuer"
                  options={ISSUERS}
                  value={issuer}
                  onValueChange={(value) => {
                    setIssuer(value);
                    onDirtyChange(true);
                  }}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                  isDisabled={isPending}
                />
              </Field>
            )}
            {step === 2 && (
              <p>
                {name} will use {issuer?.name}.
              </p>
            )}
          </div>
          <aside className="w-64 shrink-0 border-l border-border p-4 text-sm text-muted">
            <p>This synthetic form uses the shared Sheet, Stepper, and Combobox.</p>
            {isPending && (
              <Button className="mt-4" variant="outline" onClick={finishSave}>
                Finish Simulated Save
              </Button>
            )}
          </aside>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={cancel} isDisabled={isPending}>
            Cancel
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} isDisabled={isPending}>
              Back
            </Button>
          )}
          {step < 2 ? (
            <Button
              key="next"
              variant="project"
              onClick={() => setStep(step + 1)}
              isDisabled={!name.trim() || (step === 1 && !issuer) || isPending}
            >
              Next
            </Button>
          ) : (
            <Button key="create" type="submit" variant="project" isPending={isPending}>
              Create Profile
            </Button>
          )}
        </SheetFooter>
      </form>
    </>
  );
};

const SheetCreationRender = ({ showHeader }: { showHeader: boolean }) => {
  const [options, setOptions] = useState(PROFILES);
  const [value, setValue] = useState<Profile[]>([PROFILES[0]]);
  const [isPending, setIsPending] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [parentSubmits, setParentSubmits] = useState(0);
  const cancelRef = useRef(() => {});
  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        setIsDirty(false);
        cancelRef.current();
      }
    });
  const requestCancel = (cancel: () => void) => {
    cancelRef.current = cancel;
    requestDiscard();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="project">Attach Profiles</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach Certificate Profiles</DialogTitle>
          <DialogDescription>
            Creation selects a profile without saving the attachment.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setParentSubmits((count) => count + 1);
          }}
        >
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="attach-profiles">Certificate Profiles</FieldLabel>
              <Combobox
                id="attach-profiles"
                multiple
                options={options}
                value={value}
                onValueChange={setValue}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
                creation={{
                  mode: "sheet",
                  size: "workspace",
                  ...(showHeader
                    ? {
                        title: "Create Certificate Profile",
                        description: "Configure a profile before attaching it to the application."
                      }
                    : { showHeader: false }),
                  emptyLabel: "Create New Profile",
                  isPending,
                  onDismiss: requestCancel,
                  renderForm: (props) => (
                    <>
                      <ProfileForm
                        {...props}
                        cancel={() => requestCancel(props.cancel)}
                        showHeader={showHeader}
                        isPending={isPending}
                        onPendingChange={setIsPending}
                        onDirtyChange={setIsDirty}
                        onCreated={(profile) => {
                          setOptions((current) => [...current, profile]);
                          setValue((current) => [...current, profile]);
                        }}
                      />
                      <DiscardChangesAlertDialog
                        open={isDiscardDialogOpen}
                        onOpenChange={setIsDiscardDialogOpen}
                        onDiscard={confirmDiscard}
                        title="Discard Profile Setup?"
                        description="Your profile configuration will be lost."
                      />
                    </>
                  )
                }}
              />
            </Field>
            <p className="mt-2 text-xs text-muted">Attachment submits: {parentSubmits}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" variant="project">
              Attach
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const meta = {
  title: "Generic/Combobox/Creation",
  component: Combobox,
  parameters: { layout: "centered" },
  tags: ["autodocs"]
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj;

export const SheetCreation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Sheet creation takes the existing Sheet size. renderForm returns a scrollable body and SheetFooter, not another Sheet or SheetContent. Use one caller-owned pending state for the form and creation.isPending, and route onDismiss and the form's Cancel through the same discard guard."
      }
    }
  },
  render: () => <SheetCreationRender showHeader />
};

export const FormOwnedHeader: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use sheet creation for multi-step forms. With showHeader=false, renderForm provides SheetHeader, SheetTitle, and SheetDescription but no Sheet root or SheetContent. The same caller-owned pending state locks the form and shell; Finish simulated save represents the persistence response."
      }
    }
  },
  render: () => <SheetCreationRender showHeader={false} />
};

const DialogCreationRender = () => {
  const [options, setOptions] = useState(PROFILES);
  const [value, setValue] = useState<Profile | null>(null);

  return (
    <div className="w-80">
      <Field>
        <FieldLabel htmlFor="dialog-profile">Certificate Profile</FieldLabel>
        <Combobox
          id="dialog-profile"
          options={options}
          value={value}
          onValueChange={setValue}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          creation={{
            mode: "dialog",
            title: "Create Profile",
            description: "Name the profile before selecting it.",
            renderForm: ({ initialInput, complete, cancel }) => (
              <form
                className="flex min-h-0 flex-1 flex-col gap-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get("name")).trim();
                  if (!name) return;
                  const profile = { id: name, name };
                  setOptions((current) => [...current, profile]);
                  setValue(profile);
                  complete();
                }}
              >
                <DialogBody>
                  <Field>
                    <FieldLabel htmlFor="dialog-profile-name">Profile Name</FieldLabel>
                    <Input
                      id="dialog-profile-name"
                      name="name"
                      defaultValue={initialInput}
                      required
                    />
                  </Field>
                </DialogBody>
                <DialogFooter>
                  <Button variant="ghost" onClick={cancel}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="project">
                    Create Profile
                  </Button>
                </DialogFooter>
              </form>
            )
          }}
        />
      </Field>
    </div>
  );
};

export const DialogCreation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Dialog creation renders DialogHeader followed by renderForm. Return a flex column form with DialogBody for fields and DialogFooter for actions; the dialog shell supplies the padding and the footer reaches its edges, so do not pad the form or inset the button row. Update the controlled options and selection before calling complete, which closes the dialog and returns focus to the input. Cancel keeps the query and reopens the option list without changing the selection."
      }
    }
  },
  render: () => <DialogCreationRender />
};

const ActionCreationRender = () => {
  const [primary, setPrimary] = useState<Profile | null>(ISSUERS[0]);
  const [additional, setAdditional] = useState<Profile[]>([ISSUERS[0]]);
  const [isDisabled, setIsDisabled] = useState(false);
  const [wizard, setWizard] = useState<{ field: string; initialInput: string } | null>(null);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="project">Configure Issuer</Button>
      </SheetTrigger>
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>Configure Issuer</SheetTitle>
          <SheetDescription>
            Create a policy in this sheet without opening another overlay.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {wizard ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-alliance text-lg">New Policy for {wizard.field}</h2>
              <p>Initial query: {wizard.initialInput || "(empty)"}</p>
              <p>Primary selection: {primary?.name}</p>
              <p>Additional selections: {additional.map((option) => option.name).join(", ")}</p>
              <Button variant="outline" onClick={() => setWizard(null)}>
                Back to Issuer
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <Field>
                <FieldLabel htmlFor="primary-policy">Primary Policy</FieldLabel>
                <Combobox
                  id="primary-policy"
                  options={ISSUERS}
                  value={primary}
                  onValueChange={setPrimary}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                  creation={{
                    mode: "action",
                    emptyLabel: "Create New Policy",
                    formatLabel: () => "Create New Policy",
                    isDisabled,
                    onAction: (initialInput) => setWizard({ field: "Primary", initialInput })
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="additional-policies">Additional Policies</FieldLabel>
                <Combobox
                  id="additional-policies"
                  multiple
                  options={ISSUERS}
                  value={additional}
                  onValueChange={setAdditional}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                  creation={{
                    mode: "action",
                    emptyLabel: "Create New Policy",
                    formatLabel: () => "Create New Policy",
                    isDisabled,
                    onAction: (initialInput) => setWizard({ field: "Additional", initialInput })
                  }}
                />
              </Field>
              <Button variant="outline" onClick={() => setIsDisabled(!isDisabled)}>
                {isDisabled ? "Enable Creation" : "Disable Creation"}
              </Button>
            </div>
          )}
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const ActionCreation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use action creation when the existing form switches into a sub-wizard without opening another overlay. The Create row stays available for empty, duplicate, and unmatched queries unless isDisabled is set. Selecting it closes only the picker and calls onAction with the trimmed query. Action mode does not persist, track pending work, or select an option; the caller owns the workflow and any later option or selection updates."
      }
    }
  },
  render: () => <ActionCreationRender />
};
