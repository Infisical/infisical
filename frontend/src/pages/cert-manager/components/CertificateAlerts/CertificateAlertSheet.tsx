import { useEffect, useMemo, useState } from "react";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
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
  TAlert,
  TCertificateAlertEventType,
  toChannelInput,
  useCreateAlert,
  useUpdateAlert
} from "@app/hooks/api/alerts";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { buildNextChannel, canReceiveAlerts } from "@app/views/Alerts";

import { CertificateAlertAddChannelMenu, ChannelsStep } from "./ChannelsStep";
import { DetailsStep } from "./DetailsStep";
import { FiltersStep } from "./FiltersStep";
import { ReviewStep } from "./ReviewStep";
import {
  certificateAlertFormSchema,
  CertificateAlertScopeKind,
  CertificateAlertStep,
  emptyCertificateAlertForm,
  getAlertResourceId,
  getAlertResourceType,
  getScopeEventTypes,
  getSteps,
  STEP_FIELDS,
  TCertificateAlertForm,
  TCertificateAlertScope,
  TMemberEmails,
  toApiEventType,
  toCertificateAlertForm,
  toCondition
} from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  scope: TCertificateAlertScope;
  alert?: TAlert;
  isReadOnly?: boolean;
  usedEventTypes: TCertificateAlertEventType[];
};

type WizardProps = Omit<Props, "isOpen"> & {
  members: TMemberEmails;
  onDirtyChange: (isDirty: boolean) => void;
};

const CertificateAlertWizard = ({
  onOpenChange,
  projectId,
  scope,
  alert,
  isReadOnly = false,
  usedEventTypes,
  members,
  onDirtyChange
}: WizardProps) => {
  const isEditing = Boolean(alert);
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();

  const form = useForm<TCertificateAlertForm>({
    resolver: zodResolver(certificateAlertFormSchema),
    mode: "onChange",
    defaultValues: alert
      ? toCertificateAlertForm(alert, members)
      : emptyCertificateAlertForm(
          getScopeEventTypes(scope).find((event) => !usedEventTypes.includes(event))
        )
  });
  const eventType = useWatch({ control: form.control, name: "eventType" });
  const steps = getSteps(scope, eventType);
  const [step, setStep] = useState(isReadOnly ? steps.length - 1 : 0);
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "channels" });
  const { isDirty } = form.formState;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = async (values: TCertificateAlertForm) => {
    const channels = values.channels.map(toChannelInput);
    const condition = toCondition(scope, values);

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
          resourceType: getAlertResourceType(scope, values.eventType),
          resourceId: getAlertResourceId(scope),
          eventType: toApiEventType(scope, values.eventType),
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
    const stepFields = STEP_FIELDS[steps[step].key];
    if (stepFields) {
      if (await form.trigger(stepFields)) setStep(step + 1);
      return;
    }
    await form.handleSubmit(onSubmit)();
  };

  const isLast = step === steps.length - 1;
  const { isSubmitting } = form.formState;
  const currentStep = steps[step];
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
                {scope.kind === CertificateAlertScopeKind.Application
                  ? `Get notified about certificate events in ${scope.applicationName}.`
                  : "Get notified about certificate events across Certificate Manager."}
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
                {steps.map((item, index) => (
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
            {currentStep.key === CertificateAlertStep.Channels && (
              <CertificateAlertAddChannelMenu channelCount={fields.length} onAdd={addChannel} />
            )}
          </div>

          {currentStep.key === CertificateAlertStep.Details && (
            <DetailsStep
              form={form}
              scope={scope}
              isEditing={isEditing}
              usedEventTypes={usedEventTypes}
            />
          )}
          {currentStep.key === CertificateAlertStep.Filters && (
            <FiltersStep form={form} projectId={projectId} />
          )}
          {currentStep.key === CertificateAlertStep.Channels && (
            <ChannelsStep
              form={form}
              fields={fields}
              onRemove={remove}
              projectId={projectId}
              scope={scope}
              alertId={alert?.id}
              members={members}
            />
          )}
          {currentStep.key === CertificateAlertStep.Review && (
            <ReviewStep form={form} scope={scope} members={members} />
          )}
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
              Step {step + 1} of {steps.length}
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

  const [isDirty, setIsDirty] = useState(false);
  const closeSheet = () => {
    setIsDirty(false);
    onOpenChange(false);
  };
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      requestDiscard();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent size="wide" className="flex h-full max-h-full flex-col gap-y-0">
          {isOpen && isUsersPending && (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          )}
          {isOpen && !isUsersPending && (
            <CertificateAlertWizard
              key={props.alert?.id ?? "new"}
              onOpenChange={(open) => (open ? onOpenChange(true) : closeSheet())}
              onDirtyChange={setIsDirty}
              members={members}
              {...props}
            />
          )}
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this alert will be lost."
      />
    </>
  );
};
