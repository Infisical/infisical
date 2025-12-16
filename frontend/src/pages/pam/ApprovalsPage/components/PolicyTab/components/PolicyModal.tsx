import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import {
  ApprovalPolicyType,
  TApprovalPolicy,
  useCreateApprovalPolicy,
  useUpdateApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { PolicyApprovalSteps } from "./PolicySteps/PolicyApprovalSteps";
import { PolicyDetailsStep } from "./PolicySteps/PolicyDetailsStep";
import { PolicyReviewStep } from "./PolicySteps/PolicyReviewStep";
import { PolicyFormSchema, TPolicyForm } from "./PolicySchema";

type Props = {
  popUp: UsePopUpState<["policy"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["policy"]>, state?: boolean) => void;
};

const FORM_STEPS: { name: string; key: string; fields: (keyof TPolicyForm)[] }[] = [
  {
    name: "Configuration",
    key: "configuration",
    fields: ["name", "constraints", "conditions"]
  },
  { name: "Approval Sequence", key: "approvals", fields: ["steps"] },
  { name: "Review", key: "review", fields: [] }
];

export const PolicyModal = ({ popUp, handlePopUpToggle }: Props) => {
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
      conditions: [{ accountPaths: [] }],
      constraints: {
        accessDuration: {
          min: "30s",
          max: "7d"
        }
      },
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

  const { handleSubmit, trigger, reset } = formMethods;

  const { mutateAsync: createPolicy, isPending: isCreating } = useCreateApprovalPolicy();
  const { mutateAsync: updatePolicy, isPending: isUpdating } = useUpdateApprovalPolicy();

  useEffect(() => {
    if (policyData?.policy) {
      reset({
        name: policyData.policy.name,
        maxRequestTtl: policyData.policy.maxRequestTtl,
        conditions: policyData.policy.conditions.conditions,
        constraints: policyData.policy.constraints.constraints,
        steps: policyData.policy.steps.map((step) => ({
          ...step,
          name: step.name || ""
        }))
      });
    } else {
      reset({
        name: "",
        maxRequestTtl: null,
        conditions: [{ accountPaths: [] }],
        constraints: {
          accessDuration: {
            min: "30s",
            max: "7d"
          }
        },
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
          policyType: ApprovalPolicyType.PamAccess,
          policyId: policyData.policyId,
          ...data
        });
        createNotification({
          text: "Successfully updated policy",
          type: "success"
        });
      } else {
        await createPolicy({
          policyType: ApprovalPolicyType.PamAccess,
          projectId: currentProject.id,
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
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedStepIndex);

    if (!isValid) return;

    setSelectedStepIndex((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (selectedStepIndex === 0) {
      handlePopUpToggle("policy", false);
      return;
    }

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
    <Modal isOpen={isOpen} onOpenChange={(open) => handlePopUpToggle("policy", open)}>
      <ModalContent
        title={policyData?.policyId ? "Edit Access Policy" : "Create Access Policy"}
        subTitle="Configure a policy dictating account access with constraints"
        className="max-w-3xl"
      >
        <FormProvider {...formMethods}>
          <form>
            <Tab.Group selectedIndex={selectedStepIndex} onChange={setSelectedStepIndex}>
              <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
                {FORM_STEPS.map((step, index) => (
                  <Tab
                    onClick={async (e) => {
                      e.preventDefault();
                      const isEnabled = await isTabEnabled(index);
                      setSelectedStepIndex((prev) => (isEnabled ? index : prev));
                    }}
                    className={({ selected }) =>
                      `-mb-[0.14rem] whitespace-nowrap ${index > selectedStepIndex ? "opacity-30" : ""} px-4 py-2 text-sm font-medium outline-hidden disabled:opacity-60 ${
                        selected
                          ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                          : "text-bunker-300"
                      }`
                    }
                    key={step.key}
                  >
                    {index + 1}. {step.name}
                  </Tab>
                ))}
              </Tab.List>
              <Tab.Panels>
                <Tab.Panel>
                  <PolicyDetailsStep />
                </Tab.Panel>
                <Tab.Panel>
                  <PolicyApprovalSteps />
                </Tab.Panel>
                <Tab.Panel>
                  <PolicyReviewStep />
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>

            <div className="mt-6 flex justify-between border-t border-mineshaft-600 pt-4">
              <Button type="button" variant="outline_bg" onClick={handlePrev}>
                {selectedStepIndex === 0 ? "Cancel" : "Back"}
              </Button>
              <Button
                type="button"
                onClick={handleNext}
                isLoading={isCreating || isUpdating}
                isDisabled={isCreating || isUpdating}
              >
                {isFinalStep && (policyData?.policyId ? "Update" : "Create")}
                {!isFinalStep && "Next"}
              </Button>
            </div>
          </form>
        </FormProvider>
      </ModalContent>
    </Modal>
  );
};
