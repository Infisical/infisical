import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FileTextIcon,
  LinkIcon,
  ShieldCheckIcon
} from "lucide-react";

import { Modal, ModalContent } from "@app/components/v2";
import { Badge, Button } from "@app/components/v3";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AdcsCaInstallForm } from "./AdcsCaInstallForm";
import { ExternalCaInstallForm } from "./ExternalCaInstallForm";
import { InternalCaInstallForm } from "./InternalCaInstallForm";
import { VenafiCaInstallForm } from "./VenafiCaInstallForm";

type Props = {
  popUp: UsePopUpState<["installCaCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["installCaCert"]>, state?: boolean) => void;
};

enum SigningMethod {
  Internal = "internal",
  Manual = "manual",
  Automated = "automated"
}

type TSigningMethodOption = {
  value: SigningMethod;
  name: string;
  description: string;
  icon: typeof FileTextIcon;
};

const SIGNING_METHOD_OPTIONS: TSigningMethodOption[] = [
  {
    value: SigningMethod.Internal,
    name: "Infisical CA",
    description:
      "Sign with an internal Infisical root or intermediate CA. Fully managed, no external setup needed.",
    icon: ShieldCheckIcon
  },
  {
    value: SigningMethod.Manual,
    name: "Manual",
    description:
      "Download the CSR, sign it with your own root CA, then upload the signed certificate chain.",
    icon: FileTextIcon
  },
  {
    value: SigningMethod.Automated,
    name: "External CA (Automated)",
    description:
      "Connect to a third-party CA provider. Infisical automatically handles certificate signing and renewal through the provider's API.",
    icon: LinkIcon
  }
];

type TIntegration = {
  id: string;
  name: string;
  description: string;
  image?: string;
};

const INTEGRATIONS: TIntegration[] = [
  {
    id: "venafi",
    name: "Venafi TLS Protect Cloud",
    description: "Automated certificate lifecycle management",
    image: "/images/integrations/Venafi.png"
  },
  {
    id: "azure-adcs",
    name: "Azure AD CS",
    description: "Microsoft Active Directory Certificate Services",
    image: "/images/integrations/Microsoft Azure.png"
  }
];

enum Step {
  ChooseMethod = "choose-method",
  ChooseIntegration = "choose-integration",
  Form = "form"
}

type RadioCardProps = {
  isSelected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  name: string;
  description: string;
  badge?: string;
  className?: string;
};

const RadioCard = ({
  isSelected,
  onClick,
  icon,
  name,
  description,
  badge,
  className
}: RadioCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-4 rounded-md border px-4 py-4 text-left transition-colors ${
      isSelected
        ? "border-project/50 bg-project/5"
        : "border-mineshaft-600 bg-mineshaft-700 hover:bg-mineshaft-600"
    } ${className ?? ""}`}
  >
    {icon}
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-mineshaft-100">{name}</span>
        {badge && <Badge variant="neutral">{badge}</Badge>}
      </div>
      <p className="mt-0.5 text-xs text-mineshaft-400">{description}</p>
    </div>
    <div
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        isSelected ? "border-none bg-project/30" : "border-mineshaft-500"
      }`}
    >
      {isSelected && <div className="h-2 w-2 rounded-full bg-mineshaft-300" />}
    </div>
  </button>
);

export const CaInstallCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popupData = popUp?.installCaCert?.data as { caId: string } | undefined;
  const caId = popupData?.caId ?? "";

  const [step, setStep] = useState<Step>(Step.ChooseMethod);
  const [selectedMethod, setSelectedMethod] = useState<SigningMethod | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);

  const resetState = () => {
    setStep(Step.ChooseMethod);
    setSelectedMethod(null);
    setSelectedIntegration(null);
  };

  const goBackToMethodSelection = () => {
    setStep(Step.ChooseMethod);
    setSelectedIntegration(null);
  };

  const handleContinue = () => {
    if (!selectedMethod) return;

    if (selectedMethod === SigningMethod.Automated) {
      setStep(Step.ChooseIntegration);
      return;
    }

    setStep(Step.Form);
  };

  const handleIntegrationContinue = () => {
    if (!selectedIntegration) return;
    setStep(Step.Form);
  };

  const renderForm = () => {
    switch (selectedMethod) {
      case SigningMethod.Internal:
        return <InternalCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
      case SigningMethod.Automated:
        if (selectedIntegration === "azure-adcs") {
          return <AdcsCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
        }
        return <VenafiCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
      case SigningMethod.Manual:
        return <ExternalCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
      default:
        return null;
    }
  };

  const renderMethodSelection = () => (
    <>
      <div className="flex flex-col gap-3">
        {SIGNING_METHOD_OPTIONS.map((option) => (
          <RadioCard
            key={option.value}
            isSelected={selectedMethod === option.value}
            onClick={() => setSelectedMethod(option.value)}
            icon={
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mineshaft-600">
                <option.icon className="h-5 w-5 text-mineshaft-300" />
              </div>
            }
            name={option.name}
            description={option.description}
          />
        ))}
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            resetState();
            handlePopUpToggle("installCaCert", false);
          }}
        >
          Cancel
        </Button>
        <Button variant="neutral" isDisabled={!selectedMethod} onClick={handleContinue}>
          {selectedMethod === SigningMethod.Automated ? "Choose Integration" : "Continue"}
          {selectedMethod === SigningMethod.Automated && <ArrowRightIcon />}
        </Button>
      </div>
    </>
  );

  const renderIntegrationSelection = () => (
    <>
      <div className="flex flex-col gap-2">
        {INTEGRATIONS.map((integration) => (
          <RadioCard
            key={integration.id}
            isSelected={selectedIntegration === integration.id}
            onClick={() => setSelectedIntegration(integration.id)}
            icon={
              integration.image ? (
                <img
                  src={integration.image}
                  alt={`${integration.name} logo`}
                  className="h-8 w-8 rounded-md bg-bunker-500 object-contain p-1"
                />
              ) : undefined
            }
            name={integration.name}
            description={integration.description}
            className="py-3"
          />
        ))}
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={goBackToMethodSelection}>
          Back
        </Button>
        <Button
          variant="neutral"
          isDisabled={!selectedIntegration}
          onClick={handleIntegrationContinue}
        >
          Continue
        </Button>
      </div>
    </>
  );

  const renderFormStep = () => {
    const selectedOption = SIGNING_METHOD_OPTIONS.find((o) => o.value === selectedMethod);
    const integration = INTEGRATIONS.find((i) => i.id === selectedIntegration);

    const isAutomated = selectedMethod === SigningMethod.Automated;
    const displayName = isAutomated && integration ? integration.name : selectedOption?.name;
    const displayDesc =
      isAutomated && integration ? integration.description : selectedOption?.description;
    const displayImage = isAutomated && integration ? integration.image : undefined;
    const DisplayIcon = selectedOption?.icon;

    return (
      <>
        <div className="mb-4 flex gap-3">
          {displayImage ? (
            <img
              src={displayImage}
              alt={`${displayName} logo`}
              className="mt-0.5 h-8 w-8 shrink-0 rounded-md bg-bunker-500 object-contain p-1"
            />
          ) : (
            DisplayIcon && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bunker-500">
                <DisplayIcon className="h-4 w-4 text-mineshaft-300" />
              </div>
            )
          )}
          <div className="flex-1">
            <div className="flex items-center">
              <span className="flex-1 text-sm font-medium text-mineshaft-100">{displayName}</span>
              <button
                type="button"
                className="shrink-0 text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
                onClick={resetState}
              >
                Change method
              </button>
            </div>
            <p className="mt-0.5 text-xs text-mineshaft-400">{displayDesc}</p>
          </div>
        </div>
        <hr className="-mx-6 mb-4 border-mineshaft-600" />
        {renderForm()}
      </>
    );
  };

  const getTitle = () => {
    if (step === Step.ChooseIntegration) {
      return (
        <div>
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-xs text-mineshaft-400 hover:text-mineshaft-300"
            onClick={goBackToMethodSelection}
          >
            <ArrowLeftIcon className="h-3 w-3" />
            Back
          </button>
          <span>Choose a CA Integration</span>
        </div>
      );
    }
    return "Install Intermediate CA Certificate";
  };

  const getSubTitle = () => {
    if (step === Step.ChooseMethod) {
      return "Choose how the signing certificate for this CA should be issued.";
    }
    if (step === Step.ChooseIntegration) {
      return "Select a provider to automate certificate signing for this intermediate CA.";
    }
    return undefined;
  };

  const needsOverflowVisible = step === Step.Form && selectedMethod === SigningMethod.Automated;

  return (
    <Modal
      isOpen={popUp?.installCaCert?.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetState();
        handlePopUpToggle("installCaCert", isOpen);
      }}
    >
      <ModalContent
        title={getTitle()}
        className="max-w-lg"
        bodyClassName={needsOverflowVisible ? "overflow-visible" : undefined}
        subTitle={getSubTitle()}
      >
        {step === Step.ChooseMethod && renderMethodSelection()}
        {step === Step.ChooseIntegration && renderIntegrationSelection()}
        {step === Step.Form && renderFormStep()}
      </ModalContent>
    </Modal>
  );
};
