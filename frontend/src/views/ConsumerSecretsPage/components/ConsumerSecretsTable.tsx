import React, { useEffect, useState } from "react";
import { AiFillDelete,AiFillEdit } from "react-icons/ai";
import ViewConsumerSecret from "./ViewConsumerSecret";

import {
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr,
} from "@app/components/v2";
import { IconButton } from "@app/components/v2/IconButton";
import { useGetConsumerSecrets, useRemoveConsumerSecret } from "@app/hooks/api/consumerSecrets";
import { toast } from "react-toastify";
import { usePopUp } from "@app/hooks";
import { Modal, ModalContent } from "@app/components/v2";
import { EditConsumerSecretForm } from "./EditConsumerSecretForm";
import { TConsumerSecret } from "@app/hooks/api/consumerSecrets/types";

export const ConsumerSecretsTable = () => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [editState, setEditState] = useState<TConsumerSecret>();

  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "updateConsumerSecret"
  ] as const);

  const deleteConsumerSecret = useRemoveConsumerSecret();
  const toastOnSecretDeletionSuccess = () => toast("Alert: Secret deleted!", {
    autoClose: 3000,
    position: "bottom-right",
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    theme: "dark",
    type: 'error'
  });

  const mapConsumerSecretValuesToTypes = {
    "web_login": "Web Login",
    "credit_card": "Credit Card",
    "private_note": "Private Note"
  }

  const { data, isLoading } = useGetConsumerSecrets({
    offset: (page - 1) * perPage,
    limit: perPage,
  });

  const handleDelete = async (id: string) => {
    console.log(`Delete secret: ${id}`);

    await deleteConsumerSecret.mutateAsync({
      id: id
    })

    toastOnSecretDeletionSuccess();
  };

  if (isLoading) {
    return <TableSkeleton rows={perPage} columns={5} innerKey="consumer-secrets-table" />;
  }

  if (!data || data.secrets.length === 0) {
    return <EmptyState title="No Secrets">No consumer secrets found.</EmptyState>;
  }

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Sl. No</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              {/* <Th>Created At</Th> */}
              <Th>Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {data.secrets.map((secret, index) => (
              <Tr key={secret.id}>
                <Th>{(page - 1) * perPage + index + 1}</Th>
                <Th>{secret.name}</Th>
                <Th>{mapConsumerSecretValuesToTypes[secret.type]}</Th>
                {/* <Th>{format(new Date(secret.createdAt), "dd/MM/yyyy")}</Th> */}
                <Th>
                <div className="flex space-x-2">
                  <ViewConsumerSecret secret={secret} />
                  <IconButton
                    variant="plain"
                    ariaLabel="edit"
                    className="hover:bg-gray-200 p-2 rounded"
                    onClick={() => {
                      handlePopUpOpen("updateConsumerSecret");
                      setEditState(secret);
                    }}
                  >
                    <AiFillEdit className="text-xl" />
                  </IconButton>

                  {/* Edit Modal */}
                  <Modal
                    isOpen={popUp?.updateConsumerSecret?.isOpen}
                    onOpenChange={(isOpen) => {
                      handlePopUpToggle("updateConsumerSecret", isOpen);
                    }}
                  >
                    <ModalContent
                      title="Create new consumer secret"
                      subTitle="Securely store your secrets like login credentials, credit card details, etc"
                    >
                      <EditConsumerSecretForm handlePopUpClose={handlePopUpClose} editingSecret={editState} />
                    </ModalContent>
                  </Modal>
                  <IconButton
                    variant="plain"
                    ariaLabel="delete"
                    className="hover:bg-gray-200 p-2 rounded"
                    onClick={() => handleDelete(secret.id)}
                  >
                    <AiFillDelete className="text-xl" />
                  </IconButton>
                </div>

                </Th>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>

      <Pagination
        count={data.totalCount}
        page={page}
        perPage={perPage}
        onChangePage={(newPage) => setPage(newPage)}
        onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
      />
    </div>
  );
};
