import { faCheck, faCodeBranch, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Table, TableContainer, TBody, Td, Th, THead, Tr } from "@app/components/v2";

export const SecretApprovalListPage = () => {
  return (
    <div className="container mx-auto bg-bunker-800 text-white w-full h-full">
      <div className="my-6">
        <p className="text-3xl font-semibold text-gray-200">Admin Panels</p>
      </div>
      <div className="rounded-md bg-mineshaft-800 text-gray-300">
        <div className="p-4 px-8 flex items-center space-x-8">
          <div>
            <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
            27 Open
          </div>
          <div className="text-gray-500">
            <FontAwesomeIcon icon={faCheck} className="mr-2" />
            27 Closed
          </div>
        </div>
        <div className="flex flex-col border-t border-mineshaft-600">
          <div className="flex flex-col px-8 py-4">
            <div className="mb-1">
              <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />2 secrets added and 1 deleted
            </div>
            <span className="text-xs text-gray-500">
              Opened 2 hours ago by akhilmhdh - Review required
            </span>
          </div>
        </div>
      </div>
      <div className="my-4 p-4 rounded-md bg-bunker-600 text-gray-300">
        <div className="mb-4 text-lg">
          Request for <span className="text-yellow-600">secret change</span>
        </div>
        <div>
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th className="min-table-row">Secret</Th>
                  <Th>Value</Th>
                  <Th className="min-table-row">Comment</Th>
                  <Th className="min-table-row">Tags</Th>
                </Tr>
              </THead>
              <TBody>
                <Tr>
                  <Td>TWILIO_SECRET_TOKEN</Td>
                  <Td>value</Td>
                  <Td>Some values</Td>
                  <Td>-</Td>
                </Tr>
              </TBody>
            </Table>
          </TableContainer>
        </div>
        <div className="flex items-center mt-8 space-x-6">
          <Button leftIcon={<FontAwesomeIcon icon={faCheck} />}>Approve</Button>
          <Button
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faXmark} />}
            colorSchema="danger"
          >
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
};
