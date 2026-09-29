import { useMemo, useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import {
  AlertChannelType,
  TAlert,
  toChannelInput,
  useCreateAlert,
  useUpdateAlert
} from "@app/hooks/api/alerts";
import { buildNewChannel, getNextChannelName } from "@app/views/Alerts";

import { AddChannelMenu, ChannelsStep } from "./ChannelsStep";
import { DetailsStep } from "./DetailsStep";
import { ReviewStep } from "./ReviewStep";
import {
  CERTIFICATE_ALERT_RESOURCE_TYPE,
  certificateAlertFormSchema,
  emptyCertificateAlertForm,
  STEP_FIELDS,
  STEPS,
  TCertificateAlertForm,
  toCertificateAlertForm,
  toCondition,
  TProjectMemberEmails
} from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  applicationId: string;
  applicationName: string;
  alert?: TAlert;
};

type WizardProps = Omit<Props, "isOpen"> & { members: TProjectMemberEmails };

const CertificateAlertWizard = ({
  onOpenChange,
  projectId,
  applicationId,
  applicationName,
  alert,
  members
}: WizardProps) => {
  const isEditing = Boolean(alert);
  const [step, setStep] = useState(0);
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();

  const form = useForm<TCertificateAlertForm>({
    resolver: zodResolver(certificateAlertFormSchema),
    mode: "onChange",
    defaultValues: alert ? toCertificateAlertForm(alert, members) : emptyCertificateAlertForm()
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "channels" });

  const onSubmit = async (values: TCertificateAlertForm) => {
    const channels = values.channels.map(toChannelInput);
    const condition = toCondition(values);

    try {
      if (alert) {
        await updateAlert.mutateAsync({
          alertId: alert.id,
          name: values.name,
          description: values.description || null,
          enabled: values.enabled,
          condition,
          channels
        });
        createNotification({ type: "success", text: "Successfully updated alert" });
      } else {
        await createAlert.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          resourceType: CERTIFICATE_ALERT_RESOURCE_TYPE,
          resourceId: applicationId,
          eventType: values.eventType,
          condition,
          enabled: values.enabled,
          projectId,
          channels
        });
        createNotification({ type: "success", text: "Successfully created alert" });
      }
      onOpenChange(false);
    } catch {
      // MutationCache reports request errors globally; keep the sheet open for another attempt.
    }
  };

  const addChannel = (channelType: AlertChannelType) => {
    const takenNames = new Set(form.getValues("channels").map((channel) => channel.name));
    append(buildNewChannel(channelType, getNextChannelName(takenNames, channelType)));
  };

  const goNext = async () => {
    if (step < STEP_FIELDS.length) {
      if (await form.trigger(STEP_FIELDS[step])) setStep(step + 1);
      return;
    }
    await form.handleSubmit(onSubmit)();
  };

  const isLast = step === STEPS.length - 1;
  const { isSubmitting } = form.formState;
  const currentStep = STEPS[step];
  const submitLabel = isEditing ? "Update Alert" : "Create Alert";

  return (
    <FormProvider {...form}>
      <SheetHeader className="border-b">
        <SheetTitle>
          <div className="flex w-full items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
              <BellIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-label">
                {isEditing ? "Edit Certificate Alert" : "Create Certificate Alert"}
              </div>
              <SheetDescription className="leading-4 text-muted">
                Get notified about certificate events in {applicationName}.
              </SheetDescription>
            </div>
          </div>
        </SheetTitle>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border px-5 py-6">
          <p className="mb-5 text-sm text-muted">Setup Steps</p>
          <Stepper
            activeStep={step}
            orientation="vertical"
            onStepChange={(index) => {
              if (index < step) setStep(index);
            }}
          >
            <StepperList>
              {STEPS.map((item, index) => (
                <StepperStep
                  key={item.name}
                  index={index}
                  title={item.name}
                  description={item.shortDescription}
                />
              ))}
            </StepperList>
          </Stepper>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
              <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
            </div>
            {step === 1 && <AddChannelMenu channelCount={fields.length} onAdd={addChannel} />}
          </div>

          {step === 0 && <DetailsStep form={form} isEditing={isEditing} />}
          {step === 1 && (
            <ChannelsStep
              form={form}
              fields={fields}
              onRemove={remove}
              projectId={projectId}
              applicationId={applicationId}
              members={members}
            />
          )}
          {step === 2 && <ReviewStep form={form} members={members} />}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
        <span className="text-xs text-muted">
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((current) => current - 1)}>
              Back
            </Button>
          )}
          <Button
            variant="project"
            onClick={goNext}
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            {isLast ? submitLabel : "Continue"}
          </Button>
        </div>
      </div>
    </FormProvider>
  );
};

export const CertificateAlertSheet = ({ isOpen, onOpenChange, ...props }: Props) => {
  const { data: projectUsers, isPending: isUsersPending } = useGetWorkspaceUsers(
    props.projectId,
    true,
    undefined,
    { enabled: isOpen }
  );

  const members = useMemo((): TProjectMemberEmails => {
    const byUserId = new Map<string, string>();
    const byEmail = new Map<string, string>();
    (projectUsers ?? []).forEach(({ user }) => {
      if (!user.isOrgMembershipActive || user.isOrgMembershipPending) return;
      const email = (user.email || user.username || "").toLowerCase();
      if (!email) return;
      byUserId.set(user.id, email);
      byEmail.set(email, user.id);
    });
    return {
      emailByUserId: byUserId,
      memberIdByEmail: byEmail,
      isAvailable: Boolean(projectUsers)
    };
  }, [projectUsers]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="wide" className="flex h-full max-h-full flex-col gap-y-0">
        {isOpen && isUsersPending && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )}
        {isOpen && !isUsersPending && (
          <CertificateAlertWizard
            key={props.alert?.id ?? "new"}
            onOpenChange={onOpenChange}
            members={members}
            {...props}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
