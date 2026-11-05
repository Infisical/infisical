import { format } from "date-fns";
import FileSaver from "file-saver";
import { ClipboardListIcon, DownloadIcon, EllipsisIcon } from "lucide-react";

import {
  CopyButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Loader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
        <Loader />
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
          <TableHead className="w-px">CRL Number</TableHead>
          <TableHead className="w-px">Last Updated</TableHead>
          <TableHead className="w-px">Next Update</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {caCrls.map(({ id, crl, crlNumber, thisUpdate, nextUpdate }) => {
          const crlUrl = `${window.origin}/api/v1/cert-manager/crl/${id}`;
          return (
            <TableRow key={`ca-crl-${id}`} className="group">
              <TableCell className="max-w-0">
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="truncate">{crlUrl}</span>
                    </TooltipTrigger>
                    <TooltipContent>{crlUrl}</TooltipContent>
                  </Tooltip>
                  <CopyButton
                    value={crlUrl}
                    ariaLabel="Copy distribution point URL"
                    className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                  />
                </div>
              </TableCell>
              <TableCell>{crlNumber}</TableCell>
              <TableCell>{format(new Date(thisUpdate), "yyyy-MM-dd")}</TableCell>
              <TableCell>{format(new Date(nextUpdate), "yyyy-MM-dd")}</TableCell>
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
                        navigator.clipboard.writeText(crlUrl);
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
