import { Card, CardContent, CardHeader, CardTitle } from "@app/components/v3";

import { CaCrlsTable } from "./CaCrlsTable";

type Props = {
  caId: string;
};

export const CaCrlsSection = ({ caId }: Props) => {
  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>CA Certificate Revocation Lists (CRLs)</CardTitle>
      </CardHeader>
      <CardContent>
        <CaCrlsTable caId={caId} />
      </CardContent>
    </Card>
  );
};
