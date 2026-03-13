import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";

import { PolicyApprovalSteps } from "@app/components/approvals";
import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import {
  ApprovalPolicyType,
  CodeSigningApprovalMode,
  TApprovalPolicy,
  useCreateApprovalPolicy,
  useUpdateApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CodeSigningPolicyDetailsStep } from "./CodeSigningPolicySteps/CodeSigningPolicyDetailsStep";
import { CodeSigningPolicyReviewStep } from "./CodeSigningPolicySteps/CodeSigningPolicyReviewStep";
import { CodeSigningPolicyFormSchema, TCodeSigningPolicyForm } from "./CodeSigningPolicySchema";

type Props = {
  popUp: UsePopUpState<["policy"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["policy"]>, state?: boolean) => void;
};

type CodeSigningConstraints = {
  approvalMode: CodeSigningApprovalMode;
  maxWindowDuration?: string;
  maxSignings?: number;
};

const FORM_STEPS: { name: string; key: string; fields: (keyof TCodeSigningPolicyForm)[] }[] = [
  {
    name: "Configuration",
    key: "configuration",
    fields: ["name", "constraints"]
  },
  { name: "Approval Sequence", key: "approvals", fields: ["steps"] },
  { name: "Review", key: "review", fields: [] }
];

export const CodeSigningPolicyModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const isOpen = popUp?.policy?.isOpen;
  const policyData = popUp?.policy?.data as
    | { policyId: string; policy: TApprovalPolicy }
    | undefined;

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const formMethods = useForm<TCodeSigningPolicyForm>({
    resolver: zodResolver(CodeSigningPolicyFormSchema),
    defaultValues: {
      name: "",
      maxRequestTtl: null,
      constraints: {
        approvalMode: CodeSigningApprovalMode.Manual
      },
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

  const { handleSubmit, trigger, reset } = formMethods;

  const { mutateAsync: createPolicy, isPending: isCreating } = useCreateApprovalPolicy();
  const { mutateAsync: updatePolicy, isPending: isUpdating } = useUpdateApprovalPolicy();

  useEffect(() => {
    if (policyData?.policy) {
      const constraints = policyData.policy.constraints.constraints as CodeSigningConstraints;
      reset({
        name: policyData.policy.name,
        maxRequestTtl: policyData.policy.maxRequestTtl,
        constraints: {
          approvalMode: constraints.approvalMode || CodeSigningApprovalMode.Manual,
          maxWindowDuration: constraints.maxWindowDuration,
          maxSignings: constraints.maxSignings
        },
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
        constraints: {
          approvalMode: CodeSigningApprovalMode.Manual
        },
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

  const onSubmit = async (data: TCodeSigningPolicyForm) => {
    if (!currentProject?.id) return;

    if (policyData?.policyId) {
      await updatePolicy({
        policyType: ApprovalPolicyType.CertManagerCodeSigning,
        policyId: policyData.policyId,
        ...data
      });
      createNotification({
        text: "Successfully updated policy",
        type: "success"
      });
    } else {
      await createPolicy({
        policyType: ApprovalPolicyType.CertManagerCodeSigning,
        projectId: currentProject.id,
        conditions: [],
        ...data
      });
      createNotification({
        text: "Successfully created policy",
        type: "success"
      });
    }
    handlePopUpToggle("policy", false);
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
        title={
          policyData?.policyId
            ? "Edit Code Signing Approval Policy"
            : "Create Code Signing Approval Policy"
        }
        subTitle="Configure a code signing approval policy requiring approval before signing operations"
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
                  <CodeSigningPolicyDetailsStep />
                </Tab.Panel>
                <Tab.Panel>
                  <PolicyApprovalSteps />
                </Tab.Panel>
                <Tab.Panel>
                  <CodeSigningPolicyReviewStep />
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
