import { useState } from "react";
import { useParams } from "@tanstack/react-router";

import {
  Button,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
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

  const { projectId } = useParams({ strict: false });
  const { isSubOrganization } = useOrganization();

  // eslint-disable-next-line no-nested-ternary
  const primaryVariant = projectId ? "project" : isSubOrganization ? "sub-org" : "org";

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
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="thin-scrollbar flex-1 overflow-y-auto p-4">
          <IdentityAuthMethodModalContent
            popUp={popUp}
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
    </Sheet>
  );
};
