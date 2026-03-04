import FileSaver from "file-saver";
import { ClipboardListIcon, DownloadIcon, EllipsisIcon } from "lucide-react";

import { Lottie } from "@app/components/v2";
import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useGetCaCrls } from "@app/hooks/api";

type Props = {
  caId: string;
};

export const CaCrlsTable = ({ caId }: Props) => {
  const { data: caCrls, isPending } = useGetCaCrls(caId);

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  if (isPending) {
    return (
      <div className="flex h-40 w-full items-center justify-center">
        <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
      </div>
    );
  }

  if (!caCrls?.length) {
    return (
      <UnstableEmpty className="border">
        <UnstableEmptyHeader>
          <UnstableEmptyTitle>This CA does not have any CRLs</UnstableEmptyTitle>
        </UnstableEmptyHeader>
      </UnstableEmpty>
    );
  }

  return (
    <UnstableTable>
      <UnstableTableHeader>
        <UnstableTableRow>
          <UnstableTableHead>Distribution Point URL</UnstableTableHead>
          <UnstableTableHead className="w-5" />
        </UnstableTableRow>
      </UnstableTableHeader>
      <UnstableTableBody>
        {caCrls.map(({ id, crl }) => {
          return (
            <UnstableTableRow key={`ca-crl-${id}`}>
              <UnstableTableCell>{`${window.origin}/api/v1/cert-manager/crl/${id}`}</UnstableTableCell>
              <UnstableTableCell>
                <UnstableDropdownMenu>
                  <UnstableDropdownMenuTrigger asChild>
                    <UnstableIconButton variant="ghost" size="xs">
                      <EllipsisIcon />
                    </UnstableIconButton>
                  </UnstableDropdownMenuTrigger>
                  <UnstableDropdownMenuContent align="end">
                    <UnstableDropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(
                          `${window.origin}/api/v1/cert-manager/crl/${id}`
                        );
                      }}
                    >
                      <ClipboardListIcon />
                      Copy CRL URL
                    </UnstableDropdownMenuItem>
                    <UnstableDropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadTxtFile("crl.pem", crl);
                      }}
                    >
                      <DownloadIcon />
                      Download CRL
                    </UnstableDropdownMenuItem>
                  </UnstableDropdownMenuContent>
                </UnstableDropdownMenu>
              </UnstableTableCell>
            </UnstableTableRow>
          );
        })}
      </UnstableTableBody>
    </UnstableTable>
  );
};
