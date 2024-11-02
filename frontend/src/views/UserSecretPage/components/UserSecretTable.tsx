import { useState, useEffect } from "react";
import { faKey, faTrash, faEye, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
  Pagination,
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
import { UsePopUpState } from "@app/hooks/usePopUp";
import { useGetUserSecrets } from "@app/hooks/api/userSecret";
import { CredentialType } from "@app/hooks/api/userSecret/types";

type Props = {
credentialTypeFilter: string,
searchQuery: string,
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecretConfirmation", "viewSecret", "editSecret"]>,
    {
      name,
      id,
      type,
      description,
      username,
      password,
      website,
      cardNumber,
      cardholderName,
      expiryDate,
      cvv,
      content
    }: {
      name: string;
      id?: string;
      type?: CredentialType;
      description?: string;
      username?: string;
      password?: string;
      website?: string;
      cardNumber?: string;
      cardholderName?: string;
      expiryDate?: string;
      cvv?: string;
      content?: string;
    }
  ) => void;
};

export const UserSecretsTable = ({ handlePopUpOpen, credentialTypeFilter, searchQuery }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [currentFilter, setCurrentFilter] = useState(credentialTypeFilter);

  useEffect(() => {
    setPage(1);
    setCurrentFilter(credentialTypeFilter);
  }, [credentialTypeFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const { isLoading, data } = useGetUserSecrets({
    offset: (page - 1) * perPage,
    limit: perPage,
    type: currentFilter === "all" ? null : currentFilter,
    searchQuery: searchQuery
  });

  return (
    <TableContainer>
      <Table children={undefined}>
        <THead children={undefined}>
          <Tr>
            <Th>Name</Th>
            <Th>Description</Th>
            <Th>Type</Th>
            <Th>Created</Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody children={undefined}>
          {isLoading && <TableSkeleton columns={4} innerKey="user-secrets" />}
          {!isLoading &&
            data?.secrets?.map((row: any) => (
              <Tr key={row.id}>
                <Td>{row.name}</Td>
                <Td>{row.description || "-"}</Td>
                <Td>{row.type.replace(/([A-Z])/g, ' $1').trim().charAt(0).toUpperCase() + row.type.replace(/([A-Z])/g, ' $1').trim().slice(1)}</Td>
                <Td>
                  {new Date(row.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Tooltip content="View secret">
                    <IconButton
                      variant="plain"
                      onClick={() => handlePopUpOpen("viewSecret", {
                        name: row.name,
                        type: row.type,
                        // Add fields based on the type
                        ...(row.type === CredentialType.WEB_LOGIN && {
                          username: row.username,
                          password: row.password,
                          website: row.website
                        }),
                        ...(row.type === CredentialType.CREDIT_CARD && {
                          cardNumber: row.cardNumber,
                          cardholderName: row.cardholderName,
                          expiryDate: row.expiryDate,
                          cvv: row.cvv
                        }),
                        ...(row.type === CredentialType.SECURE_NOTE && {
                          content: row.content
                        })
                      })}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </IconButton>
                    </Tooltip>
                    <Tooltip content="Edit secret">
                    <IconButton
                      variant="plain"
                      onClick={() => handlePopUpOpen("editSecret", {
                        id: row.id,
                        name: row.name,
                        type: row.type,
                        description: row.description,
                        // Add fields based on the type
                        ...(row.type === CredentialType.WEB_LOGIN && {
                          username: row.username,
                          password: row.password,
                          website: row.website
                        }),
                        ...(row.type === CredentialType.CREDIT_CARD && {
                          cardNumber: row.cardNumber,
                          cardholderName: row.cardholderName,
                          expiryDate: row.expiryDate,
                          cvv: row.cvv
                        }),
                        ...(row.type === CredentialType.SECURE_NOTE && {
                          content: row.content
                        })
                      })}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </IconButton>
                    </Tooltip>

                    <Tooltip content="Delete secret">
                    
                    <IconButton
                      variant="plain"
                      onClick={() =>
                        handlePopUpOpen("deleteUserSecretConfirmation", {
                          name: row.name,
                          id: row.id
                        })
                      }
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-gray-400" />
                    </IconButton>
                    </Tooltip>
                  </div>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>
      {!isLoading &&
        data?.secrets &&
        data?.totalCount >= perPage &&
        data?.totalCount !== undefined && (
          <Pagination
            count={data.totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
      {!isLoading && !data?.secrets?.length && (
        <EmptyState title="No user secrets found" icon={faKey} />
      )}
    </TableContainer>
  );
};