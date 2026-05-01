import FileSaver from "file-saver";
import { ClipboardListIcon, DownloadIcon, EllipsisIcon } from "lucide-react";

import { Lottie } from "@app/components/v2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
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
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>This CA does not have any CRLs</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Distribution Point URL</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {caCrls.map(({ id, crl }) => {
          return (
            <TableRow key={`ca-crl-${id}`}>
              <TableCell>{`${window.origin}/api/v1/cert-manager/crl/${id}`}</TableCell>
              <TableCell>
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
                        navigator.clipboard.writeText(
                          `${window.origin}/api/v1/cert-manager/crl/${id}`
                        );
                      }}
                    >
                      <ClipboardListIcon />
                      Copy CRL URL
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadTxtFile("crl.pem", crl);
                      }}
                    >
                      <DownloadIcon />
                      Download CRL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
