import { type ReactNode, useState } from "react";
import {
  faDeleteLeft,
  faEye,
  faEyeSlash,
  faPencil,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  IconButton,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useDeleteUserSecret } from "@app/hooks/api/userSecrets/mutations";

interface RowData {
  id: string;
  [key: string]: ReactNode;
}

type Props<T extends RowData> = {
  title: string;
  data: T[];
  headers: Partial<Record<keyof T, string>>;
  renderForm: (options: { onSubmit: () => void; formData?: T }) => ReactNode;
  hiddenValue: keyof T;
  loaderKey: string;
  isLoading?: boolean;
};

export const SecretsTable = <T extends RowData>({
  title,
  data,
  headers,
  renderForm,
  hiddenValue,
  loaderKey,
  isLoading
}: Props<T>) => {
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [areSecretsVisible, setAreSecretsVisible] = useState(false);
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "createSecret",
    "editSecret",
    "deleteSecret"
  ] as const);

  const deleteUserSecret = useDeleteUserSecret();

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row">
          <p className="text-2xl text-bunker-100">{title}</p>

          <div className="ml-auto flex flex-row gap-2">
            <Button
              variant="outline_bg"
              className="p-1"
              leftIcon={<FontAwesomeIcon icon={areSecretsVisible ? faEyeSlash : faEye} />}
              onClick={() => setAreSecretsVisible((prev) => !prev)}
            >
              {areSecretsVisible ? "Hide Secrets" : "Reveal Secrets"}
            </Button>

            <Button
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("createSecret")}
            >
              New Secret
            </Button>
          </div>
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
              {isLoading && <TableSkeleton columns={3} innerKey={loaderKey} />}
              {!isLoading &&
                data.map((item) => (
                  <Tr key={item.id}>
                    {Object.keys(headers).map((col) => (
                      <Td key={`${item.id}-${col}`}>
                        {col === hiddenValue && !areSecretsVisible ? "*****" : item[col]}
                      </Td>
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
        <ModalContent title={`New ${title}`}>
          {renderForm({
            onSubmit: () => {
              handlePopUpClose("createSecret");
              createNotification({
                type: "success",
                text: `Successfully created new ${title}`
              });
            }
          })}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={popUp.editSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSecret", isOpen)}
      >
        <ModalContent title={`Edit ${title}`}>
          {renderForm({
            onSubmit: () => {
              handlePopUpClose("editSecret");
              createNotification({
                type: "success",
                text: `Successfully edited ${popUp.editSecret.data?.name}`
              });
            },
            formData: popUp.editSecret.data
          })}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={popUp.deleteSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecret", isOpen)}
      >
        <ModalContent title={`Delete ${title}`}>
          <div className="flex flex-col gap-6">
            <p>Are you sure you want to delete this secret?</p>

            <div className="flex flex-row gap-2">
              <Button
                className="w-1/2"
                isLoading={isDeleteLoading}
                onClick={async () => {
                  setIsDeleteLoading(true);
                  await deleteUserSecret.mutateAsync({ userSecretId: popUp.deleteSecret.data?.id });
                  handlePopUpClose("deleteSecret");
                  createNotification({
                    type: "success",
                    text: `Successfully deleted secret: ${popUp.deleteSecret.data?.name}`
                  });
                }}
              >
                Delete {popUp.deleteSecret.data?.name}
              </Button>
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
