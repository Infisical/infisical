import { type ReactNode } from "react";
import { faDeleteLeft, faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  IconButton,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";

interface RowData {
  id: string;
  [key: string]: ReactNode;
}

type Props<T extends RowData> = {
  title: string;
  data: T[];
  headers: Partial<Record<keyof T, string>>;
  renderForm: (data?: T) => ReactNode;
};

export const SecretsTable = <T extends RowData>({ title, data, headers, renderForm }: Props<T>) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "createSecret",
    "editSecret",
    "deleteSecret"
  ] as const);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row">
          <p className="text-2xl text-bunker-100">{title}</p>
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => handlePopUpOpen("createSecret")}
            className="ml-auto"
          >
            New Secret
          </Button>
        </div>

        <TableContainer>
          <Table>
            <THead>
              <Tr>
                {Object.entries(headers).map(([key, header]) => (
                  <Th key={key}>{header}</Th>
                ))}

                <Th>Actions</Th>
              </Tr>
            </THead>

            <TBody>
              {data.map((item) => (
                <Tr key={item.id}>
                  {Object.keys(headers).map((col) => (
                    <Td key={item.id}>{item[col]}</Td>
                  ))}

                  <Th>
                    <div className="flex flex-row gap-4">
                      <IconButton
                        ariaLabel="edit secret"
                        variant="outline"
                        onClick={() => handlePopUpOpen("editSecret", item)}
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </IconButton>

                      <IconButton
                        ariaLabel="delete secret"
                        variant="outline"
                        onClick={() => handlePopUpOpen("deleteSecret", item)}
                      >
                        <FontAwesomeIcon icon={faDeleteLeft} />
                      </IconButton>
                    </div>
                  </Th>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      </div>

      <Modal
        isOpen={popUp.createSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createSecret", isOpen)}
      >
        <ModalContent title={`New ${title}`}>{renderForm()}</ModalContent>
      </Modal>

      <Modal
        isOpen={popUp.editSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSecret", isOpen)}
      >
        <ModalContent title={`Edit ${title}`}>{renderForm(popUp.editSecret.data)}</ModalContent>
      </Modal>

      <Modal
        isOpen={popUp.deleteSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecret", isOpen)}
      >
        <ModalContent title={`Delete ${title}`}>
          <div className="flex flex-col gap-6">
            <p>Are you sure you want to delete this secret?</p>

            <div className="flex flex-row gap-2">
              <Button className="w-1/2">Delete {popUp.deleteSecret.data?.name}</Button>
              <Button
                className="w-1/2"
                variant="outline"
                onClick={() => handlePopUpClose("deleteSecret")}
              >
                Cancel
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
