import { useState } from "react";

import { Spinner } from "@app/components/v2";
import { useGetMyDuplicateAccount } from "@app/hooks/api";

import { EmailDuplicationConfirmation } from "./EmailDuplicationConfirmation";
import { SelectOrganizationSection } from "./SelectOrgSection";

const LoadingScreen = () => {
  return (
    <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
      <Spinner />
      <p className="text-white opacity-80">Loading, please wait</p>
    </div>
  );
};

export const SelectOrganizationPage = () => {
  const duplicateAccounts = useGetMyDuplicateAccount();
  const [removeDuplicateLater, setRemoveDuplicateLater] = useState(false);

  if (duplicateAccounts.isPending) {
    return <LoadingScreen />;
  }

  if (duplicateAccounts.data?.duplicateAccounts?.length && !removeDuplicateLater) {
    return (
      <EmailDuplicationConfirmation onRemoveDuplicateLater={() => setRemoveDuplicateLater(true)} />
    );
  }

  return <SelectOrganizationSection />;
};
