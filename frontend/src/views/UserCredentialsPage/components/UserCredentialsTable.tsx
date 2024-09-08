import { useState } from "react";
import { faPen, faUserSecret } from "@fortawesome/free-solid-svg-icons";
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
import { useGetCredentials } from "@app/hooks/api/userCredentials/queries";
import { CredentialKind, TUserCredential } from "@app/hooks/api/userCredentials/types";

export type Login = TUserCredential & { kind: CredentialKind.login; id: string }
export type SecureNote = TUserCredential & { kind: CredentialKind.secureNote; id: string }

type LoginTableProps = {
  credentials?: TUserCredential[],
  isLoading: boolean
  onEditTriggered?: (credential: Login) => void
}

type LoginRowProps = {
  credential: Login,
  onClick?: (credential: Login) => void
}

function LoginItemRow({ credential, onClick }: LoginRowProps) {
  return (
    <Tr key={credential.name}>
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
            // handlePopUpOpen("deleteSharedSecretConfirmation", {
            //  name: "delete",
            //  id: credential.id
            // });
            if (onClick) onClick(credential);
          }}
          variant="plain"
          ariaLabel="delete"
        >
          <FontAwesomeIcon icon={faPen} />
        </IconButton>
      </Td>
    </Tr>
  );
}

function LoginTable({ credentials, isLoading, onEditTriggered }: LoginTableProps) {
  const loginCreds: Login[] | undefined =
    credentials?.filter(cred => cred.kind === CredentialKind.login) as Login[];

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Website  </Th>
            <Th>Username </Th>
            <Th>Password </Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        {!isLoading && Array.isArray(loginCreds) && loginCreds.length === 0 ? (
          <Tr>
            <Td colSpan={3}>
              <EmptyState
                title="No web logins have been added so far"
                icon={faUserSecret}
              />
            </Td>
          </Tr>
        ) : null}

        {!isLoading && Array.isArray(loginCreds) && loginCreds.length > 0 &&
          loginCreds?.map((credential) =>
          (<LoginItemRow
            credential={credential}
            onClick={onEditTriggered}
            key={credential.id}
          />))
        }

      </Table>
    </TableContainer>
  );
}

function CreditCardTable() {
  const credentials: Credential[] = [];

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Card Number  </Th>
            <Th>Expiry Date </Th>
            <Th>CVV </Th>
          </Tr>
        </THead>

        {credentials.length === 0 ? (
          <Tr>
            <Td colSpan={3}>
              <EmptyState
                title="No credit cards have been added so far"
                icon={faUserSecret}
              />
            </Td>
          </Tr>
        ) : null}
      </Table>
    </TableContainer>
  );
}

function SecureNoteTable() {
  const credentials: Credential[] = [];
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Title </Th>
            <Th>Note     </Th>
          </Tr>
        </THead>

        {credentials.length === 0 ? (
          <Tr>
            <Td colSpan={3}>
              <EmptyState
                title="No secure notes have been added yet"
                icon={faUserSecret}
              />
            </Td>
          </Tr>
        ) : null}
      </Table>
    </TableContainer>
  );
}

type CredentialTabsProps = {
  onEditTriggered?: (credential: Login) => void
}

export default function CredentialTabs({ onEditTriggered }: CredentialTabsProps) {
  const [activeTab, setActiveTab] = useState<CredentialKind>(CredentialKind.login);
  const { isLoading, data } = useGetCredentials();

  return <Tabs value={activeTab} onValueChange={v => setActiveTab(v as CredentialKind)}>
    <TabList>
      <Tab value={CredentialKind.login}>
        Log in credentials
      </Tab>

      <Tab value={CredentialKind.creditCard} >
        Credit Cards
      </Tab>

      <Tab value={CredentialKind.secureNote}>
        Secure Notes
      </Tab>
    </TabList>

    <TabPanel value={CredentialKind.login}>
      <LoginTable
        isLoading={isLoading}
        credentials={data?.credentials}
        onEditTriggered={onEditTriggered}
      />
    </TabPanel>

    <TabPanel value={CredentialKind.creditCard}>
      <CreditCardTable />
    </TabPanel>

    <TabPanel value={CredentialKind.secureNote}>
      <SecureNoteTable />
    </TabPanel>
  </Tabs>
}


