import { faCertificate } from "@fortawesome/free-solid-svg-icons";
import FileSaver from "file-saver";
import { ClipboardListIcon, DownloadIcon } from "lucide-react";

import { EmptyState, TableSkeleton, Tooltip } from "@app/components/v2";
import {
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

  return (
    <>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Distribution Point URL</UnstableTableHead>
            <UnstableTableHead className="w-5" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isPending && <TableSkeleton columns={2} innerKey="ca-crls" />}
          {!isPending &&
            caCrls?.map(({ id, crl }) => {
              return (
                <UnstableTableRow key={`ca-crl-${id}`}>
                  <UnstableTableCell className="flex items-center gap-x-2">
                    {`${window.origin}/api/v1/cert-manager/crl/${id}`}
                    <Tooltip content="Copy CRL URL">
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(
                            `${window.origin}/api/v1/cert-manager/crl/${id}`
                          );
                        }}
                      >
                        <ClipboardListIcon className="text-label" />
                      </UnstableIconButton>
                    </Tooltip>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <Tooltip content="Download CRL">
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadTxtFile("crl.pem", crl);
                        }}
                      >
                        <DownloadIcon className="text-label" />
                      </UnstableIconButton>
                    </Tooltip>
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
        </UnstableTableBody>
      </UnstableTable>
      {!isPending && !caCrls?.length && (
        <EmptyState title="This CA does not have any CRLs" icon={faCertificate} />
      )}
    </>
  );
};
