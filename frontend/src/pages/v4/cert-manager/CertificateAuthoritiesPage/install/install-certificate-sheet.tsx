import { useId, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Heading } from "@infisical/cipher/ui/text";

import { ExternalCertificateAuthoritiesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";

import { ProviderIcon } from "../../../components/provider-icon";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license/useUpgradeGate";
import { useCaScope } from "../scope";
import {
  AdcsNativeInstallForm,
  AzureAdcsInstallForm,
  type InstallFormProps,
  InternalInstallForm,
  ManualInstallForm,
  VenafiInstallForm
} from "./forms";

type Method = "internal" | "manual" | "automated";
type Integration = "venafi" | "adcs" | "azure-adcs";

const METHODS: {
  value: Method;
  name: string;
  description: string;
  icon: "shield" | "file" | "link";
}[] = [
  {
    value: "internal",
    name: "Infisical CA",
    description: "Sign with an internal root or intermediate CA. No external setup needed.",
    icon: "shield"
  },
  {
    value: "manual",
    name: "Manual",
    description: "Download the CSR, sign it with your own CA, then upload the signed chain.",
    icon: "file"
  },
  {
    value: "automated",
    name: "External CA (automated)",
    description: "Connect a third-party CA. Infisical handles signing and renewal through its API.",
    icon: "link"
  }
];

const INTEGRATIONS: { value: Integration; name: string; description: string; icon: string }[] = [
  {
    value: "venafi",
    name: "Venafi TLS Protect Cloud",
    description: "Automated certificate lifecycle management",
    icon: "Venafi.png"
  },
  {
    value: "adcs",
    name: "Microsoft ADCS",
    description: "Active Directory Certificate Services",
    icon: "Windows.png"
  },
  {
    value: "azure-adcs",
    name: "Azure ADCS (Web Enrollment)",
    description: "Active Directory Certificate Services over HTTPS web enrollment",
    icon: "Microsoft Azure.png"
  }
];

type InstallForm = (props: InstallFormProps) => React.JSX.Element;

const METHOD_FORMS: Partial<Record<Method, InstallForm>> = {
  internal: InternalInstallForm,
  manual: ManualInstallForm
};

const INTEGRATION_FORMS: Record<Integration, InstallForm> = {
  venafi: VenafiInstallForm,
  adcs: AdcsNativeInstallForm,
  "azure-adcs": AzureAdcsInstallForm
};

type Step = "method" | "integration" | "form";

const MethodPicker = ({
  method,
  locked,
  onPick
}: {
  method?: Method;
  locked: Partial<Record<Method, boolean>>;
  onPick: (method: Method) => void;
}) => (
  <RadioGroup
    aria-label="Signing method"
    value={method ?? ""}
    onValueChange={(next) => onPick(next as Method)}
  >
    {METHODS.map((entry) => (
      <RadioGroupCard
        key={entry.value}
        value={entry.value}
        media={<Icon name={entry.icon} />}
        title={
          <Inline gap={8} align="center">
            {entry.name}
            {locked[entry.value] && (
              <Badge size="sm" tone="info">
                Enterprise
              </Badge>
            )}
          </Inline>
        }
        description={entry.description}
      />
    ))}
  </RadioGroup>
);

const IntegrationPicker = ({
  integration,
  onPick
}: {
  integration?: Integration;
  onPick: (integration: Integration) => void;
}) => (
  <RadioGroup
    aria-label="CA integration"
    value={integration ?? ""}
    onValueChange={(next) => onPick(next as Integration)}
  >
    {INTEGRATIONS.map((entry) => (
      <RadioGroupCard
        key={entry.value}
        value={entry.value}
        media={<ProviderIcon icon={entry.icon} alt="" />}
        title={entry.name}
        description={entry.description}
      />
    ))}
  </RadioGroup>
);

const ChosenMethod = ({
  method,
  integration,
  pending,
  onRestart
}: {
  method?: Method;
  integration?: Integration;
  pending: boolean;
  onRestart: () => void;
}) => {
  const chosenMethod = METHODS.find((entry) => entry.value === method);
  const chosenIntegration =
    method === "automated" ? INTEGRATIONS.find((entry) => entry.value === integration) : undefined;
  return (
    <Inline gap={12} align="center" justify="between">
      <Inline gap={8} align="center">
        {chosenIntegration ? (
          <ProviderIcon icon={chosenIntegration.icon} alt="" />
        ) : (
          chosenMethod && <Icon name={chosenMethod.icon} />
        )}
        <Heading level={3} size="subsection">
          {chosenIntegration?.name ?? chosenMethod?.name}
        </Heading>
      </Inline>
      <Button variant="link" disabled={pending} onClick={onRestart}>
        Change method
      </Button>
    </Inline>
  );
};

const PrimaryStepButton = ({
  step,
  method,
  integration,
  pending,
  formId,
  onStep
}: {
  step: Step;
  method?: Method;
  integration?: Integration;
  pending: boolean;
  formId: string;
  onStep: (step: Step) => void;
}) => {
  if (step === "form")
    return (
      <Button variant="primary" type="submit" form={formId} loading={pending}>
        Install
      </Button>
    );
  if (step === "integration")
    return (
      <Button
        variant="primary"
        disabledReason={integration ? undefined : "Choose an integration"}
        onClick={() => onStep("form")}
      >
        Continue
      </Button>
    );
  const automated = method === "automated";
  return (
    <Button
      variant="primary"
      disabledReason={method ? undefined : "Choose a signing method"}
      iconRight={automated ? "chev-right" : undefined}
      onClick={() => onStep(automated ? "integration" : "form")}
    >
      {automated ? "Choose integration" : "Continue"}
    </Button>
  );
};

const formFor = (method?: Method, integration?: Integration) => {
  if (method === "automated") return integration && INTEGRATION_FORMS[integration];
  return method && METHOD_FORMS[method];
};

const InstallFlow = ({ caId, onClose }: { caId: string; onClose: () => void }) => {
  const { orgId, projectId } = useCaScope();
  const { data: plan } = useV4Adapter("certificateAuthorities").useCaPlan(orgId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const formId = useId();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>();
  const [integration, setIntegration] = useState<Integration>();
  const [pending, setPending] = useState(false);
  const locked: Partial<Record<Method, boolean>> = {
    manual: !plan?.pkiExternalIntermediateCa,
    automated: !plan?.pkiEnterpriseCaIntegrations
  };
  const Form = formFor(method, integration);

  const pick = (next: Method) => {
    if (!locked[next]) {
      setMethod(next);
      return;
    }
    openUpgradeGate({
      intent: ExternalCertificateAuthoritiesUpgradeIntent,
      paywallKey: "cert-manager.intermediate-ca-signing"
    });
  };

  const restart = () => {
    setStep("method");
    setMethod(undefined);
    setIntegration(undefined);
  };

  return (
    <>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>
            {step === "integration"
              ? "Choose a CA integration"
              : "Install intermediate CA certificate"}
          </SheetTitle>
          {step === "method" && (
            <SheetDescription>
              Choose how this CA&apos;s signing certificate is issued.
            </SheetDescription>
          )}
        </SheetHeader>
        <SheetBody>
          {step === "method" && <MethodPicker method={method} locked={locked} onPick={pick} />}
          {step === "integration" && (
            <IntegrationPicker integration={integration} onPick={setIntegration} />
          )}
          {step === "form" && Form && (
            <Stack gap={24}>
              <ChosenMethod
                method={method}
                integration={integration}
                pending={pending}
                onRestart={restart}
              />
              <Form
                caId={caId}
                projectId={projectId}
                formId={formId}
                onPendingChange={setPending}
                onDone={onClose}
              />
            </Stack>
          )}
        </SheetBody>
        <SheetFooter>
          <PrimaryStepButton
            step={step}
            method={method}
            integration={integration}
            pending={pending}
            formId={formId}
            onStep={setStep}
          />
          {step === "integration" ? (
            <Button
              variant="outline"
              onClick={() => {
                setStep("method");
                setIntegration(undefined);
              }}
            >
              Back
            </Button>
          ) : (
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
      {upgradeGate}
    </>
  );
};

export const InstallCaCertificateSheet = ({
  caId,
  open,
  onOpenChange
}: {
  caId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Sheet open={open && Boolean(caId)} onOpenChange={onOpenChange}>
    {caId && <InstallFlow key={caId} caId={caId} onClose={() => onOpenChange(false)} />}
  </Sheet>
);
