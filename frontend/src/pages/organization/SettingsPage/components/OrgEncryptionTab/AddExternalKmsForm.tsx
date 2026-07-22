import { useState } from "react";

import {
  Button,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
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
    icon: "/images/integrations/Amazon Web Services.png",
    provider: ExternalKmsProvider.Aws,
    title: "AWS KMS",
    description: "Use an AWS KMS key to encrypt organization data."
  },
  {
    icon: "/images/integrations/Google Cloud Platform.png",
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
                <Item
                  asChild
                  variant="outline"
                  key={provider}
                  className={`cursor-pointer hover:bg-container-hover ${
                    isSubOrganization
                      ? "hover:border-sub-org/70 focus-visible:border-sub-org"
                      : "hover:border-org/70 focus-visible:border-org"
                  }`}
                >
                  <button type="button" onClick={() => setSelectedProvider(provider)}>
                    <ItemMedia variant="image">
                      <img src={icon} alt="" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{title}</ItemTitle>
                      <ItemDescription>{description}</ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
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
