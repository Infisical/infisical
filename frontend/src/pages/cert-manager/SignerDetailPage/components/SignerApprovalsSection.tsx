import { PageLoader } from "@app/components/v3";
import {
  SIGNER_TABLE_PAGE_SIZE,
  useGetSignerPolicy,
  useListSignerRequests
} from "@app/hooks/api/signers";

import { SignerApprovalPolicyTab } from "./SignerApprovalPolicyTab";
import { SignerRequestsTab } from "./SignerRequestsTab";

type Props = {
  signerId: string;
  canPreApprove: boolean;
  canRequestSign: boolean;
};

export const SignerApprovalsSection = ({ signerId, canPreApprove, canRequestSign }: Props) => {
  const { data: policy, isLoading: isPolicyLoading } = useGetSignerPolicy(signerId);
  const { data: requests, isLoading: areRequestsLoading } = useListSignerRequests({
    signerId,
    offset: 0,
    limit: SIGNER_TABLE_PAGE_SIZE
  });

  if (isPolicyLoading || areRequestsLoading) return <PageLoader />;

  if (!policy?.hasSteps && requests?.totalCount === 0) {
    return <SignerApprovalPolicyTab signerId={signerId} isStandalone />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
      <SignerApprovalPolicyTab signerId={signerId} />
      <SignerRequestsTab
        signerId={signerId}
        canPreApprove={canPreApprove}
        canRequestSign={canRequestSign}
      />
    </div>
  );
};
