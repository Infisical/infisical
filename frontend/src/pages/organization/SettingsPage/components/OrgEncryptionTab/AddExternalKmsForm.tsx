import { useState } from "react";
import { faAws, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AwsKmsForm } from "./AwsKmsForm";
import { GcpKmsForm } from "./GcpKmsForm";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
};

const EXTERNAL_KMS_LIST = [
  {
    icon: faAws,
    provider: ExternalKmsProvider.Aws,
    title: "AWS KMS",
    description: "Use an AWS KMS key to encrypt organization data."
  },
  {
    icon: faGoogle,
    provider: ExternalKmsProvider.Gcp,
    title: "GCP KMS",
    description: "Use a Google Cloud KMS key to encrypt organization data."
  }
];

const PROVIDER_TITLES: Record<ExternalKmsProvider, string> = {
  [ExternalKmsProvider.Aws]: "AWS KMS",
  [ExternalKmsProvider.Gcp]: "GCP KMS"
};

export const AddExternalKmsForm = ({ isOpen, onToggle }: Props) => {
  const { isSubOrganization } = useOrganization();
  const [selectedProvider, setSelectedProvider] = useState<ExternalKmsProvider | null>(null);

  const handleOpenChange = (state: boolean) => {
    onToggle(state);
    if (!state) {
      setSelectedProvider(null);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>
            {selectedProvider ? `Add ${PROVIDER_TITLES[selectedProvider]}` : "Add External KMS"}
          </SheetTitle>
          <SheetDescription>
            {selectedProvider
              ? `Configure ${PROVIDER_TITLES[selectedProvider]} for organization data encryption.`
              : "Select a provider for organization data encryption."}
          </SheetDescription>
        </SheetHeader>
        {!selectedProvider && (
          <>
            <div className="grid gap-3 px-4">
              {EXTERNAL_KMS_LIST.map(({ icon, provider, title, description }) => (
                <button
                  type="button"
                  key={provider}
                  onClick={() => setSelectedProvider(provider)}
                  className={`flex items-center gap-4 rounded-md border border-border bg-container p-4 text-left transition-colors outline-none hover:bg-container-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    isSubOrganization
                      ? "hover:border-sub-org/70 focus-visible:border-sub-org"
                      : "hover:border-org/70 focus-visible:border-org"
                  }`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-md border ${
                      isSubOrganization
                        ? "border-sub-org/20 bg-sub-org/10 text-sub-org"
                        : "border-org/20 bg-org/10 text-org"
                    }`}
                  >
                    <FontAwesomeIcon icon={icon} className="size-4" />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    <span className="text-xs text-accent">{description}</span>
                  </span>
                </button>
              ))}
            </div>
            <SheetFooter className="justify-end border-t">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
            </SheetFooter>
          </>
        )}
        {selectedProvider === ExternalKmsProvider.Aws && (
          <AwsKmsForm
            layout="sheet"
            secondaryActionLabel="Back"
            onCancel={() => setSelectedProvider(null)}
            onCompleted={() => handleOpenChange(false)}
          />
        )}
        {selectedProvider === ExternalKmsProvider.Gcp && (
          <GcpKmsForm
            layout="sheet"
            secondaryActionLabel="Back"
            onCancel={() => setSelectedProvider(null)}
            onCompleted={() => handleOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
