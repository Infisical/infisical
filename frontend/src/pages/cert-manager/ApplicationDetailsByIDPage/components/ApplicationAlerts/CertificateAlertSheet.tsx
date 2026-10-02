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
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { useGetOrgUsers } from "@app/hooks/api";
import {
  AlertChannelType,
  CertificateAlertEventType,
  CertificateAlertResourceType,
  TAlert,
  toChannelInput,
  useCreateAlert,
  useUpdateAlert
} from "@app/hooks/api/alerts";
import { buildNextChannel, canReceiveAlerts } from "@app/views/Alerts";

import { CertificateAlertAddChannelMenu, ChannelsStep } from "./ChannelsStep";
import { DetailsStep } from "./DetailsStep";
import { ReviewStep } from "./ReviewStep";
import {
  certificateAlertFormSchema,
  emptyCertificateAlertForm,
  STEP_FIELDS,
  STEPS,
  TCertificateAlertForm,
  TMemberEmails,
  toCertificateAlertForm,
  toCondition
} from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  applicationId: string;
  applicationName: string;
  alert?: TAlert;
  isReadOnly?: boolean;
  usedEventTypes: CertificateAlertEventType[];
};

type WizardProps = Omit<Props, "isOpen"> & { members: TMemberEmails };

const CertificateAlertWizard = ({
  onOpenChange,
  projectId,
  applicationId,
  applicationName,
  alert,
  isReadOnly = false,
  usedEventTypes,
  members
}: WizardProps) => {
  const isEditing = Boolean(alert);
  const [step, setStep] = useState(isReadOnly ? STEPS.length - 1 : 0);
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();

  const form = useForm<TCertificateAlertForm>({
    resolver: zodResolver(certificateAlertFormSchema),
    mode: "onChange",
    defaultValues: alert
      ? toCertificateAlertForm(alert, members)
      : emptyCertificateAlertForm(
          Object.values(CertificateAlertEventType).find((event) => !usedEventTypes.includes(event))
        )
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
        createNotification({ type: "success", text: `Alert "${values.name}" updated` });
      } else {
        await createAlert.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          resourceType: CertificateAlertResourceType.Application,
          resourceId: applicationId,
          eventType: values.eventType,
          condition,
          enabled: values.enabled,
          projectId,
          channels
        });
        createNotification({ type: "success", text: `Alert "${values.name}" created` });
      }
      onOpenChange(false);
    } catch {
      // MutationCache reports request errors globally; keep the sheet open for another attempt.
    }
  };

  const addChannel = (channelType: AlertChannelType) => {
    append(buildNextChannel(form.getValues("channels"), channelType));
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
  let title = isEditing ? "Edit Certificate Alert" : "Create Certificate Alert";
  if (isReadOnly) title = "Certificate Alert Details";

  return (
    <FormProvider {...form}>
      <SheetHeader className="border-b">
        <SheetTitle>
          <div className="flex w-full items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
              <BellIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-label">{title}</div>
              <SheetDescription>
                Get notified about certificate events in {applicationName}.
              </SheetDescription>
            </div>
          </div>
        </SheetTitle>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isReadOnly && (
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
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
              {!isReadOnly && <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>}
            </div>
            {step === 1 && (
              <CertificateAlertAddChannelMenu channelCount={fields.length} onAdd={addChannel} />
            )}
          </div>

          {step === 0 && (
            <DetailsStep form={form} isEditing={isEditing} usedEventTypes={usedEventTypes} />
          )}
          {step === 1 && (
            <ChannelsStep
              form={form}
              fields={fields}
              onRemove={remove}
              projectId={projectId}
              applicationId={applicationId}
              alertId={alert?.id}
              members={members}
            />
          )}
          {step === 2 && <ReviewStep form={form} members={members} />}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
        {isReadOnly ? (
          <Button variant="outline" className="ml-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>
    </FormProvider>
  );
};

export const CertificateAlertSheet = ({ isOpen, onOpenChange, ...props }: Props) => {
  const { currentOrg } = useOrganization();
  const { permission: orgPermission } = useOrgPermission();
  const canReadOrgMembers = orgPermission.can(
    OrgPermissionMemberActions.Read,
    OrgPermissionSubjects.Member
  );
  const { data: orgUsers, isLoading: isUsersPending } = useGetOrgUsers(currentOrg.id, {
    enabled: isOpen && canReadOrgMembers
  });

  const members = useMemo((): TMemberEmails => {
    const byUserId = new Map<string, string>();
    const byEmail = new Map<string, string>();
    (orgUsers ?? []).filter(canReceiveAlerts).forEach(({ user }) => {
      const email = (user.email || user.username || "").toLowerCase();
      if (!email) return;
      byUserId.set(user.id, email);
      byEmail.set(email, user.id);
    });
    return {
      emailByUserId: byUserId,
      memberIdByEmail: byEmail,
      isAvailable: Boolean(orgUsers)
    };
  }, [orgUsers]);

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
