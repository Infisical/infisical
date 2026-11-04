import { useState } from "react";
import { ArrowRightIcon, FileTextIcon, LinkIcon, ShieldCheckIcon } from "lucide-react";

import {
  ExternalCertificateAuthoritiesUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AdcsCaInstallForm } from "./AdcsCaInstallForm";
import { AdcsNativeCaInstallForm } from "./AdcsNativeCaInstallForm";
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
    id: "adcs",
    name: "Microsoft ADCS",
    description: "Microsoft Active Directory Certificate Services",
    image: "/images/integrations/Windows.png"
  },
  {
    id: "azure-adcs",
    name: "Azure ADCS (Web Enrollment)",
    description: "Active Directory Certificate Services over HTTPS web enrollment",
    image: "/images/integrations/Microsoft Azure.png"
  }
];

enum Step {
  ChooseMethod = "choose-method",
  ChooseIntegration = "choose-integration",
  Form = "form"
}

type RadioCardProps = {
  value: string;
  icon?: React.ReactNode;
  name: string;
  description: string;
  isLocked?: boolean;
};

const RadioCard = ({ value, icon, name, description, isLocked }: RadioCardProps) => {
  const id = `ca-install-option-${value}`;

  return (
    <FieldLabel htmlFor={id} variant="project">
      <Field orientation="horizontal">
        {icon}
        <FieldContent>
          <FieldTitle>
            {name}
            {isLocked && <Badge variant="info">Enterprise</Badge>}
          </FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
        <RadioGroupItem id={id} value={value} />
      </Field>
    </FieldLabel>
  );
};

export const CaInstallCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popupData = popUp?.installCaCert?.data as { caId: string } | undefined;
  const caId = popupData?.caId ?? "";

  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  // Signing an intermediate outside Infisical: Manual is the CSR/import flow, Automated connects a
  // third-party provider. Infisical CA stays available on every plan.
  const lockedMethods: Partial<Record<SigningMethod, boolean>> = {
    [SigningMethod.Manual]: !subscription.pkiExternalIntermediateCa,
    [SigningMethod.Automated]: !subscription.pkiEnterpriseCaIntegrations
  };

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

  const handleSelectMethod = (method: SigningMethod) => {
    if (!lockedMethods[method]) {
      setSelectedMethod(method);
      return;
    }

    openUpgradeGate({
      intent: ExternalCertificateAuthoritiesUpgradeIntent,
      paywallKey: "cert-manager.intermediate-ca-signing"
    });
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
        if (selectedIntegration === "adcs") {
          return <AdcsNativeCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
        }
        if (selectedIntegration === "venafi") {
          return <VenafiCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
        }
        return null;
      case SigningMethod.Manual:
        return <ExternalCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
      default:
        return null;
    }
  };

  const renderMethodSelection = () => (
    <>
      <DialogBody>
        <RadioGroup
          aria-label="Signing method"
          value={selectedMethod ?? ""}
          onValueChange={(value) => handleSelectMethod(value as SigningMethod)}
        >
          {SIGNING_METHOD_OPTIONS.map((option) => (
            <RadioCard
              key={option.value}
              value={option.value}
              isLocked={lockedMethods[option.value]}
              icon={
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-active">
                  <option.icon className="h-5 w-5 text-label" />
                </div>
              }
              name={option.name}
              description={option.description}
            />
          ))}
        </RadioGroup>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="neutral" isDisabled={!selectedMethod} onClick={handleContinue}>
          {selectedMethod === SigningMethod.Automated ? "Choose Integration" : "Continue"}
          {selectedMethod === SigningMethod.Automated && <ArrowRightIcon />}
        </Button>
      </DialogFooter>
    </>
  );

  const renderIntegrationSelection = () => (
    <>
      <DialogBody>
        <RadioGroup
          aria-label="CA integration"
          value={selectedIntegration ?? ""}
          onValueChange={setSelectedIntegration}
        >
          {INTEGRATIONS.map((integration) => (
            <RadioCard
              key={integration.id}
              value={integration.id}
              icon={
                integration.image ? (
                  <img
                    src={integration.image}
                    alt={`${integration.name} logo`}
                    className="h-8 w-8 rounded-md bg-surface-recessed object-contain p-1"
                  />
                ) : undefined
              }
              name={integration.name}
              description={integration.description}
            />
          ))}
        </RadioGroup>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={goBackToMethodSelection}>
          Back
        </Button>
        <Button
          variant="neutral"
          isDisabled={!selectedIntegration}
          onClick={handleIntegrationContinue}
        >
          Continue
        </Button>
      </DialogFooter>
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
        <div className="flex gap-3">
          {displayImage ? (
            <img
              src={displayImage}
              alt={`${displayName} logo`}
              className="mt-0.5 h-8 w-8 shrink-0 rounded-md bg-surface-recessed object-contain p-1"
            />
          ) : (
            DisplayIcon && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-recessed">
                <DisplayIcon className="h-4 w-4 text-label" />
              </div>
            )
          )}
          <div className="flex-1">
            <div className="flex items-center">
              <span className="flex-1 text-sm font-medium text-foreground">{displayName}</span>
              <button
                type="button"
                className="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-label"
                onClick={resetState}
              >
                Change method
              </button>
            </div>
            <p className="mt-0.5 text-xs text-muted">{displayDesc}</p>
          </div>
        </div>
        {renderForm()}
      </>
    );
  };

  const title =
    step === Step.ChooseIntegration
      ? "Choose a CA Integration"
      : "Install Intermediate CA Certificate";

  const getSubTitle = () => {
    if (step === Step.ChooseMethod) {
      return "Choose how the signing certificate for this CA should be issued.";
    }
    if (step === Step.ChooseIntegration) {
      return "Select a provider to automate certificate signing for this intermediate CA.";
    }
    return undefined;
  };

  const subTitle = getSubTitle();

  return (
    <>
      <Dialog
        open={popUp?.installCaCert?.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetState();
          handlePopUpToggle("installCaCert", isOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {subTitle && <DialogDescription>{subTitle}</DialogDescription>}
          </DialogHeader>
          {step === Step.ChooseMethod && renderMethodSelection()}
          {step === Step.ChooseIntegration && renderIntegrationSelection()}
          {step === Step.Form && renderFormStep()}
        </DialogContent>
      </Dialog>
      {upgradeGate}
    </>
  );
};
