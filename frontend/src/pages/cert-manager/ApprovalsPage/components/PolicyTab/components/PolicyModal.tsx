import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PolicyApprovalSteps } from "@app/components/approvals";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  CertRequestPolicyConditions,
  TApprovalPolicy,
  useCreateApprovalPolicy,
  useUpdateApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { PolicyDetailsStep } from "./PolicySteps/PolicyDetailsStep";
import { PolicyReviewStep } from "./PolicySteps/PolicyReviewStep";
import { PolicyFormSchema, TPolicyForm } from "./PolicySchema";

type Props = {
  popUp: UsePopUpState<["policy"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["policy"]>, state?: boolean) => void;
  applicationId?: string;
};

const FORM_STEPS: { name: string; key: string; fields: (keyof TPolicyForm)[] }[] = [
  {
    name: "Configuration",
    key: "configuration",
    fields: ["name", "conditions"]
  },
  { name: "Approval Sequence", key: "approvals", fields: ["steps"] },
  { name: "Review", key: "review", fields: [] }
];

export const PolicyModal = ({ popUp, handlePopUpToggle, applicationId }: Props) => {
  const { currentProject } = useProject();
  const isOpen = popUp?.policy?.isOpen;
  const policyData = popUp?.policy?.data as
    | { policyId: string; policy: TApprovalPolicy }
    | undefined;

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const formMethods = useForm<TPolicyForm>({
    resolver: zodResolver(PolicyFormSchema),
    defaultValues: {
      name: "",
      maxRequestTtl: null,
      conditions: [{ profileNames: [] }],
      constraints: {},
      bypassForMachineIdentities: false,
      steps: [
        {
          name: "",
          requiredApprovals: 1,
          notifyApprovers: true,
          approvers: []
        }
      ]
    }
  });

  const {
    handleSubmit,
    trigger,
    reset,
    formState: { isDirty, isSubmitting, isValidating }
  } = formMethods;

  const { mutateAsync: createPolicy, isPending: isCreating } = useCreateApprovalPolicy();
  const { mutateAsync: updatePolicy, isPending: isUpdating } = useUpdateApprovalPolicy();
  const isPending = isCreating || isUpdating || isSubmitting;
  const { requestDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen, confirmDiscard } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => handlePopUpToggle("policy", false)
    });

  useEffect(() => {
    if (policyData?.policy) {
      const conditions = policyData.policy.conditions.conditions as CertRequestPolicyConditions;
      reset({
        name: policyData.policy.name,
        maxRequestTtl: policyData.policy.maxRequestTtl,
        conditions,
        constraints: {},
        bypassForMachineIdentities: policyData.policy.bypassForMachineIdentities ?? false,
        steps: policyData.policy.steps.map((step) => ({
          ...step,
          name: step.name || ""
        }))
      });
    } else {
      reset({
        name: "",
        maxRequestTtl: null,
        conditions: [{ profileNames: [] }],
        constraints: {},
        bypassForMachineIdentities: false,
        steps: [
          {
            name: "",
            requiredApprovals: 1,
            notifyApprovers: true,
            approvers: []
          }
        ]
      });
    }
    setSelectedStepIndex(0);
  }, [policyData, reset, isOpen]);

  const onSubmit = async (data: TPolicyForm) => {
    if (!currentProject?.id) return;

    try {
      if (policyData?.policyId) {
        await updatePolicy({
          policyType: ApprovalPolicyType.CertRequest,
          policyId: policyData.policyId,
          ...data
        });
        createNotification({
          text: "Successfully updated policy",
          type: "success"
        });
      } else {
        await createPolicy({
          policyType: ApprovalPolicyType.CertRequest,
          scope: applicationId ? ApprovalPolicyScope.PkiApplication : ApprovalPolicyScope.Project,
          scopeId: applicationId || currentProject.id,
          ...data
        });
        createNotification({
          text: "Successfully created policy",
          type: "success"
        });
      }
      handlePopUpToggle("policy", false);
    } catch (error) {
      console.error(error);
      createNotification({
        text: `Failed to ${policyData?.policyId ? "update" : "create"} policy`,
        type: "error"
      });
    }
  };

  const isStepValid = async (index: number) => {
    const { fields } = FORM_STEPS[index];
    if (fields.length === 0) return true;
    return trigger(fields);
  };

  const isFinalStep = selectedStepIndex === FORM_STEPS.length - 1;

  const handleNext = async () => {
    if (isPending || isValidating) return;
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedStepIndex);

    if (!isValid) return;

    setSelectedStepIndex((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (isPending || isValidating) return;
    setSelectedStepIndex((prev) => prev - 1);
  };

  const isTabEnabled = async (index: number) => {
    let isEnabled = true;
    for (let i = index - 1; i >= 0; i -= 1) {
      // eslint-disable-next-line no-await-in-loop
      isEnabled = isEnabled && (await isStepValid(i));
    }

    return isEnabled;
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) requestDiscard();
      }}
    >
      <SheetContent size="form" isPending={isPending}>
        <SheetHeader>
          <SheetTitle>
            {policyData?.policyId
              ? "Edit Certificate Approval Policy"
              : "Create Certificate Approval Policy"}
          </SheetTitle>
          <SheetDescription>
            Configure a certificate approval policy requiring approval for certificate issuance.
          </SheetDescription>
        </SheetHeader>
        <FormProvider {...formMethods}>
          <form
            className="contents"
            onSubmit={async (event) => {
              event.preventDefault();
              await handleNext();
            }}
          >
            <fieldset
              disabled={isPending}
              className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-4"
            >
              <Tabs
                value={FORM_STEPS[selectedStepIndex].key}
                onValueChange={async (value) => {
                  if (isPending || isValidating) return;
                  const index = FORM_STEPS.findIndex((step) => step.key === value);
                  if (await isTabEnabled(index)) setSelectedStepIndex(index);
                }}
              >
                <TabsList variant="project" aria-label="Policy configuration steps">
                  {FORM_STEPS.map((step, index) => (
                    <TabsTrigger
                      value={step.key}
                      disabled={isPending || isValidating}
                      key={step.key}
                    >
                      {index + 1}. {step.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="configuration">
                  <PolicyDetailsStep applicationId={applicationId} />
                </TabsContent>
                <TabsContent value="approvals">
                  <PolicyApprovalSteps applicationId={applicationId} />
                </TabsContent>
                <TabsContent value="review">
                  <PolicyReviewStep />
                </TabsContent>
              </Tabs>
            </fieldset>

            <SheetFooter className="justify-end border-t">
              {selectedStepIndex > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto"
                  onClick={handlePrev}
                  isDisabled={isPending || isValidating}
                >
                  Back
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={requestDiscard} isDisabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                isPending={isPending}
                isDisabled={isPending || isValidating}
              >
                {isFinalStep && (policyData?.policyId ? "Update" : "Create")}
                {!isFinalStep && "Next"}
              </Button>
            </SheetFooter>
          </form>
        </FormProvider>
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="Your unsaved policy changes will be lost."
        />
      </SheetContent>
    </Sheet>
  );
};
