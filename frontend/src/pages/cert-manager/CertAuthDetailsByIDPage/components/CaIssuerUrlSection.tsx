import { ClipboardListIcon, EllipsisIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import { CaType, useGetCa } from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";

type Props = {
  caId: string;
};

export const CaIssuerUrlSection = ({ caId }: Props) => {
  const { data } = useGetCa({ caId, type: CaType.INTERNAL });
  const ca = data as TInternalCertificateAuthority | undefined;

  if (!ca?.configuration.activeCaCertId) {
    return null;
  }

  const caIssuerUrl = `${window.origin}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${ca.configuration.activeCaCertId}/der`;

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>CA Certificate Distribution</CardTitle>
        <CardDescription>Public URL for distributing this CA certificate</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border bg-container">
          <div className="border-b border-border px-3 py-2 text-xs text-accent">CA Issuer URL</div>
          <div className="flex items-start gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-sm break-all text-mineshaft-200">
              {caIssuerUrl}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton variant="ghost" size="xs">
                  <EllipsisIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(caIssuerUrl);
                  }}
                >
                  <ClipboardListIcon />
                  Copy CA URL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
