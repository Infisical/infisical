import { useState } from "react";

import { ContentLoader } from "@app/components/v2";
import { useGetMyDuplicateAccount } from "@app/hooks/api";

import { EmailDuplicationConfirmation } from "./EmailDuplicationConfirmation";
import { SelectOrganizationSection } from "./SelectOrgSection";

export const SelectOrganizationPage = () => {
  const duplicateAccounts = useGetMyDuplicateAccount();
  const [removeDuplicateLater, setRemoveDuplicateLater] = useState(false);

  if (duplicateAccounts.isPending) {
    return (
      <div className="h-screen w-screen bg-bunker-800">
        <ContentLoader />
      </div>
    );
  }

  if (duplicateAccounts.data?.duplicateAccounts?.length && !removeDuplicateLater) {
    return (
      <EmailDuplicationConfirmation onRemoveDuplicateLater={() => setRemoveDuplicateLater(true)} />
    );
  }

  return <SelectOrganizationSection />;
};
