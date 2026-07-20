import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";

import { EnvKeyPlatformModal } from "./EnvKeyPlatformModal";
import { VaultPlatformModal } from "./VaultPlatformModal";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
};

enum WizardSteps {
  SelectPlatform = "select-platform",
  PlatformInputs = "platform-inputs"
}

const PLATFORM_LIST = [
  {
    image: "/images/integrations/EnvKey.png",
    platform: "env-key",
    title: "EnvKey",
    size: 34
  },
  {
    image: "/images/integrations/Vault.png",
    platform: "vault",
    title: "HCP Vault",
    size: 40
  }
] as const;

export const SelectImportFromPlatformModal = ({ isOpen, onToggle }: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectPlatform);
  const [selectedPlatform, setSelectedPlatform] = useState<(typeof PLATFORM_LIST)[number] | null>(
    null
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setWizardStep(WizardSteps.SelectPlatform);
      setSelectedPlatform(null);
    }
    onToggle(open);
  };

  const title = selectedPlatform
    ? `Import from ${selectedPlatform.title}`
    : "Import from external source";

  return (
    <Dialog open={Boolean(isOpen)} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {wizardStep === WizardSteps.SelectPlatform && (
            <DialogDescription>Select a platform to import from</DialogDescription>
          )}
        </DialogHeader>
        {wizardStep === WizardSteps.SelectPlatform && (
          <div className="flex items-center space-x-4">
            {PLATFORM_LIST.map((platform, idx) => (
              <div
                key={`platform-${idx + 1}`}
                className="flex h-28 w-32 cursor-pointer flex-col items-center justify-between rounded-sm border border-border bg-container p-6 py-5 transition-all hover:border-accent/40 hover:bg-foreground/5"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedPlatform(platform);
                  setWizardStep(WizardSteps.PlatformInputs);
                }}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter") {
                    setSelectedPlatform(platform);
                    setWizardStep(WizardSteps.PlatformInputs);
                  }
                }}
              >
                <img
                  src={platform.image}
                  alt={`${platform.title} logo`}
                  style={{ width: platform.size }}
                />
                <div className="text-center text-sm whitespace-pre-wrap text-foreground">
                  {platform.title}
                </div>
              </div>
            ))}
          </div>
        )}
        {wizardStep === WizardSteps.PlatformInputs && (
          <>
            {selectedPlatform?.platform === "env-key" && (
              <EnvKeyPlatformModal onClose={() => handleOpenChange(false)} />
            )}
            {selectedPlatform?.platform === "vault" && (
              <VaultPlatformModal onClose={() => handleOpenChange(false)} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
