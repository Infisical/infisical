import React, { useState } from "react";
import { AiFillDelete,AiFillEdit, AiFillEye } from "react-icons/ai";

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
import { useGetConsumerSecrets } from "@app/hooks/api/consumerSecrets";

export const ConsumerSecretsTable = () => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const mapConsumerSecretValuesToTypes = {
    "web_login": "Web Login",
    "credit_card": "Credit Card",
    "private_note": "Private Note"
  }

  const { data, isLoading } = useGetConsumerSecrets({
    offset: (page - 1) * perPage,
    limit: perPage,
  });

  const handleView = (id: string) => {
    console.log(`View secret: ${id}`);
  };

  const handleEdit = (id: string) => {
    console.log(`Edit secret: ${id}`);
  };

  const handleDelete = (id: string) => {
    console.log(`Delete secret: ${id}`);
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
                  <IconButton
                    variant="plain"
                    ariaLabel="view"
                    className="hover:bg-gray-200 p-2 rounded"
                    onClick={() => handleView(secret.id)}
                  >
                    <AiFillEye className="text-xl" />
                  </IconButton>
                  <IconButton
                    variant="plain"
                    ariaLabel="edit"
                    className="hover:bg-gray-200 p-2 rounded"
                    onClick={() => handleEdit(secret.id)}
                  >
                    <AiFillEdit className="text-xl" />
                  </IconButton>
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
