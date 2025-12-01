import { faCertificate, faFileDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import * as x509 from "@peculiar/x509";
// import { format } from "date-fns";
import FileSaver from "file-saver";

import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
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
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Distribution Point URL</Th>
            {/* <Th>This Update</Th> */}
            {/* <Th>Next Update</Th> */}
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={4} innerKey="ca-certificates" />}
          {!isPending &&
            caCrls?.map(({ id, crl }) => {
              //   const caCrlObj = new x509.X509Crl(crl);
              return (
                <Tr key={`ca-crl-${id}`}>
                  <Td>
                    <div className="flex items-center">
                      {`${window.origin}/api/v1/cert-manager/crl/${id}`}
                    </div>
                  </Td>
                  {/* <Td>{format(new Date(caCrlObj.thisUpdate), "yyyy-MM-dd")}</Td> */}
                  {/* <Td>
                    {caCrlObj.nextUpdate
                      ? format(new Date(caCrlObj.nextUpdate), "yyyy-MM-dd")
                      : "-"}
                  </Td> */}
                  <Td>
                    <Tooltip content="Download CRL">
                      <IconButton
                        ariaLabel="copy icon"
                        variant="plain"
                        className="group relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadTxtFile("crl.pem", crl);
                        }}
                      >
                        <FontAwesomeIcon icon={faFileDownload} />
                      </IconButton>
                    </Tooltip>
                  </Td>
                </Tr>
              );
            })}
        </TBody>
      </Table>
      {!isPending && !caCrls?.length && (
        <EmptyState title="This CA does not have any CRLs" icon={faCertificate} />
      )}
    </TableContainer>
  );
};
