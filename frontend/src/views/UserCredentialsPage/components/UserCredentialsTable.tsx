import { useCallback, useState } from "react";
import { faPen, faTrash, faUserSecret } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  EmptyState,
  IconButton,
  Tab,
  Table,
  TableContainer,
  TabList,
  TabPanel,
  Tabs,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useDeleteCredential } from "@app/hooks/api/userCredentials/mutation";
import { CredentialKind, TUserCredential } from "@app/hooks/api/userCredentials/types";

import { readableCredentialKind } from "../util";

export type Login = TUserCredential & {
  kind: CredentialKind.login;
  credentialId: string;
}

export type SecureNote = TUserCredential & {
  kind: CredentialKind.secureNote;
  credentialId: string
}

type LoginRowProps = {
  credential: Login,
  onEdit?: (credential: Login) => void
  onDelete: (credential: Login) => void
}

function LoginItemRow({ credential, onEdit, onDelete }: LoginRowProps) {
  return (
    <Tr key={credential.name}>

      <Td>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            if (onEdit) onEdit(credential);
          }}
          variant="plain"
          ariaLabel="edit"
        >
          <FontAwesomeIcon icon={faPen} />
        </IconButton>
      </Td>


      <Td>{credential.name}</Td>
      <Td>{credential.website}</Td>
      <Td>{credential.username}</Td>
      <Td className="hover:bg-mineshaft-700 duration-100 cursor-pointer" onClick={async () => {
        await navigator.clipboard.writeText(credential.password);
        createNotification({
          text: <> Copied password for <strong> {credential.name} </strong> to clipboard.</>,
          type: "info"
        });
      }} >
        {"•".repeat(12)}
      </Td>

      <Td>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onDelete(credential);
          }}
          variant="plain"
          ariaLabel="delete"
        >
          <FontAwesomeIcon icon={faTrash} />
        </IconButton>
      </Td>

    </Tr>
  );
}

type SecureNoteItemRowProps = {
  credential: SecureNote,
  onEdit?: (credential: SecureNote) => void
  onDelete: (credential: SecureNote) => void
}

function SecureNoteItemRow({ credential, onEdit, onDelete }: SecureNoteItemRowProps) {
  return (
    <Tr key={credential.name}>
      <Td>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            if (onEdit) onEdit(credential);
          }}
          variant="plain"
          ariaLabel="edit"
        >
          <FontAwesomeIcon icon={faPen} />
        </IconButton>
      </Td>

      <Td>{credential.name}</Td>
      <Td className="hover:bg-mineshaft-700 duration-100 cursor-pointer" onClick={async () => {
        await navigator.clipboard.writeText(credential.note);
        createNotification({
          text: <> Copied Note ({credential.name}) to clipboard.</>,
          type: "info"
        });
      }} >
        {"•".repeat(Math.max(12, credential.note.length))}
      </Td>

      <Td>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onDelete(credential);
          }}
          variant="plain"
          ariaLabel="delete"
        >
          <FontAwesomeIcon icon={faTrash} />
        </IconButton>
      </Td>
    </Tr>
  );
}

type CredentialTableProps = {
  credentials?: TUserCredential[],
  isLoading: boolean;
  credentialKind: CredentialKind;
  tableHeaders: string[];
  onEditTriggered?: (credential: TUserCredential) => void
  onDelete: (credential: TUserCredential) => void
}


function CredentialTable({
  credentials,
  credentialKind,
  tableHeaders,
  isLoading,
  onEditTriggered,
  onDelete,
}: CredentialTableProps) {
  const credentialsToShow = credentials?.filter(cred => cred.kind === credentialKind);

  const tHeaders = tableHeaders.map(header => <Th key={header}>{header}</Th>);
  // columns for "edit" and "delete" buttons on each credential
  tHeaders.unshift(<Th aria-label="button" className="w-5" />);
  tHeaders.push(<Th aria-label="button" className="w-5" />);

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr> {tHeaders}  </Tr>
        </THead>
        {(() => {
          if (credentialsToShow?.length === 0) {
            return (
              <Tr>
                <Td colSpan={tHeaders.length}>
                  <EmptyState
                    title={`No ${readableCredentialKind(credentialKind)}s have been added so far`}
                    icon={faUserSecret}
                  />
                </Td>
              </Tr>
            )
          }

          if (isLoading) return null; // TODO(@srijan): show loader here

          switch (credentialKind) {
            case CredentialKind.login:
              return credentialsToShow?.map((login) =>
              (<LoginItemRow
                credential={login as Login}
                key={login.credentialId}
                onEdit={onEditTriggered}
                onDelete={(credential) => {
                  onDelete(credential);
                }}
              />))
            case CredentialKind.secureNote:
              return credentialsToShow?.map((secureNote) =>
              (<SecureNoteItemRow
                credential={secureNote as SecureNote}
                key={secureNote.credentialId}
                onEdit={onEditTriggered}
                onDelete={
                  (credential) => {
                    onDelete(credential);
                  }
                }
              />))
            default: return null
          }
        })()}

      </Table>
    </TableContainer>
  );
}

type CredentialTabsProps = {
  isLoading: boolean,
  allCredentials: TUserCredential[];
  onEditTriggered?: (credential: TUserCredential) => void
  onCredentialDeleted: (credential: TUserCredential) => void
}

export default function CredentialTabs({
  allCredentials,
  onEditTriggered,
  onCredentialDeleted,
  isLoading
}: CredentialTabsProps) {
  const [activeTab, setActiveTab] = useState<CredentialKind>(CredentialKind.login);
  const deleteCredential = useDeleteCredential();

  const onDelete = useCallback((credential: TUserCredential) => {
    if (credential.credentialId) {
      deleteCredential.mutate({
        kind: credential.kind,
        credentialId: credential.credentialId
      });
      onCredentialDeleted(credential);
    }
  }, [deleteCredential])

  return <Tabs value={activeTab} onValueChange={v => setActiveTab(v as CredentialKind)}>
    <TabList>
      <Tab value={CredentialKind.login}>
        Log in credentials
      </Tab>

      <Tab value={CredentialKind.secureNote}>
        Secure Notes
      </Tab>
    </TabList>

    <TabPanel value={CredentialKind.login}>
      <CredentialTable
        isLoading={isLoading}
        credentials={allCredentials}
        credentialKind={CredentialKind.login}
        tableHeaders={["Name", "Website", "Username", "Password"]}
        onEditTriggered={onEditTriggered}
        onDelete={onDelete}
      />
    </TabPanel>

    <TabPanel value={CredentialKind.secureNote}>
      <CredentialTable
        isLoading={isLoading}
        credentials={allCredentials}
        credentialKind={CredentialKind.secureNote}
        tableHeaders={["Name", "Note"]}
        onEditTriggered={onEditTriggered}
        onDelete={onDelete}
      />
    </TabPanel>
  </Tabs>
}

