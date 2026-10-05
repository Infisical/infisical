import { useRef, useState } from "react";

import { IdentityAuthUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import {
  Button,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityAuthMethodModalContent } from "./IdentityAuthMethodModalContent";
import { IDENTITY_AUTH_FORM_ID } from "./types";

type Props = {
  popUp: UsePopUpState<["identityAuthMethod", "upgradePlan"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "upgradePlan"]>,
    state?: boolean
  ) => void;
};

export const IdentityAuthMethodModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<IdentityAuthMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sheetTriggerRef = useRef<HTMLElement | null>(null);
  const upgradeTriggerRef = useRef<HTMLElement | null>(null);

  const primaryVariant = useScopeVariant();

  const initialAuthMethod = popUp?.identityAuthMethod?.data?.authMethod;

  const isSelectedAuthAlreadyConfigured =
    popUp?.identityAuthMethod?.data?.allAuthMethods?.includes(selectedAuthMethod);

  const title = isSelectedAuthAlreadyConfigured ? "Edit Auth Method" : "Add Auth Method";

  return (
    <Sheet
      open={popUp?.identityAuthMethod?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identityAuthMethod", isOpen);
        if (!isOpen) setIsSubmitting(false);
      }}
    >
      <SheetContent
        side="right"
        className="flex flex-col gap-0 sm:max-w-lg"
        aria-hidden={popUp.upgradePlan.isOpen || undefined}
        onOpenAutoFocus={() => {
          sheetTriggerRef.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          if (popUp.upgradePlan.isOpen) event.preventDefault();
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="thin-scrollbar flex-1 overflow-y-auto p-4">
          <IdentityAuthMethodModalContent
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identity={{
              name: popUp?.identityAuthMethod?.data?.name,
              authMethods: popUp?.identityAuthMethod?.data?.allAuthMethods,
              id: popUp?.identityAuthMethod.data?.identityId
            }}
            initialAuthMethod={initialAuthMethod}
            setSelectedAuthMethod={setSelectedAuthMethod}
            isUpdate={Boolean(isSelectedAuthAlreadyConfigured)}
            onSubmittingChange={setIsSubmitting}
          />
        </div>
        <SheetFooter className="border-t">
          <Button
            type="submit"
            form={IDENTITY_AUTH_FORM_ID}
            variant={primaryVariant}
            isPending={isSubmitting}
            isDisabled={isSubmitting || !selectedAuthMethod}
          >
            {isSelectedAuthAlreadyConfigured ? "Update" : "Add"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            isDisabled={isSubmitting}
            onClick={() => handlePopUpToggle("identityAuthMethod", false)}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
      <UpgradeGate
        paywallKey="organization.identity-auth-method-modal"
        isOpen={popUp?.upgradePlan?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        onOpenAutoFocus={() => {
          upgradeTriggerRef.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          const target =
            upgradeTriggerRef.current?.isConnected && upgradeTriggerRef.current !== document.body
              ? upgradeTriggerRef.current
              : sheetTriggerRef.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        intent={{
          ...IdentityAuthUpgradeIntent,
          description: `Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`,
          isEnterpriseFeature: Boolean(popUp.upgradePlan.data?.isEnterpriseFeature)
        }}
      />
    </Sheet>
  );
};
