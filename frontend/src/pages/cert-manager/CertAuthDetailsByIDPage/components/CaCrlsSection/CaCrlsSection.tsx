import {
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";

import { CaCrlsTable } from "./CaCrlsTable";

type Props = {
  caId: string;
};

export const CaCrlsSection = ({ caId }: Props) => {
  return (
    <UnstableCard className="w-full">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>CA Certificate Revocation Lists (CRLs)</UnstableCardTitle>
      </UnstableCardHeader>
      <UnstableCardContent>
        <CaCrlsTable caId={caId} />
      </UnstableCardContent>
    </UnstableCard>
  );
};
