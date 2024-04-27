import { useState } from "react";
import { useRouter } from "next/router";
import { faUsers } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  EmptyState,
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
import { useListUsersWithMyEmail, useMergeUsers } from "@app/hooks/api";
import { UserAliasType } from "@app/hooks/api/users/types";

type Props = {
  username: string;
  authType?: UserAliasType;
  organizationSlug: string;
};

export const MergeUsersStep = ({ username, authType, organizationSlug }: Props) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [targetUsername, setTargetUsername] = useState("");
  const { data: users, isLoading: isLoadingUsers } = useListUsersWithMyEmail();
  const { mutateAsync: mergeUser, isLoading: isLoadingMerge } = useMergeUsers();
  const handleMergeUser = async (mergeWithUsername: string) => {
    try {
      if (!mergeWithUsername) return;
      await mergeUser({ username: mergeWithUsername });

      createNotification({
        text: "Successfully merged user",
        type: "success"
      });

      setIsOpen(false);

      switch (authType) {
        case UserAliasType.SAML: {
          window.open(`/api/v1/sso/redirect/saml2/organizations/${organizationSlug}`);
          window.close();
          break;
        }
        case UserAliasType.LDAP: {
          router.push(`/login/ldap?organizationSlug=${organizationSlug}`);
          break;
        }
        default: {
          router.push("/login");
          break;
        }
      }

      setTargetUsername("");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to merge user",
        type: "error"
      });
    }
  };

  return (
    <div className="mx-auto h-full max-w-xl">
      <p className="text-md flex justify-center text-bunker-200">
        We found an account with the same verified email.
      </p>
      <p className="text-md mb-8 flex justify-center text-bunker-200">
        Select the account to merge with it.
      </p>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Username</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoadingUsers && <TableSkeleton columns={3} innerKey="same-email-users" />}
            {!isLoadingUsers &&
              users
                ?.filter((user) => user.username !== username)
                ?.map((user) => {
                  return (
                    <Tr className="h-10 items-center" key={`same-email-user-${user.id}`}>
                      <Td>{`${user.firstName ?? ""} ${user.lastName ?? ""}`}</Td>
                      <Td>{user.username}</Td>
                      <Td>
                        <Button
                          colorSchema="primary"
                          variant="outline_bg"
                          type="submit"
                          onClick={() => {
                            setIsOpen(true);
                            setTargetUsername(user.username);
                          }}
                        >
                          Merge
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
            {!isLoadingUsers && !users?.length && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No users found with the same email" icon={faUsers} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
        <ModalContent title="Merge User Confirmation">
          <p className="mb-4 text-bunker-300">
            The merge operation will transfer / consolidate your existing organization membership to
            the target user you&apos;re merging with.
          </p>
          <p className="mb-4 text-bunker-300">
            If the target user is not yet part of the same organization, then they will be added to
            it under your current organization membership. Conversely, if the target user is already
            part of the organization, then their existing organization membership will remain.
          </p>
          <p className="text-bunker-300">
            Once the merge operation is complete, you&apos;ll be prompted to re-login.
          </p>
          <div className="mt-8 flex items-center">
            <Button
              isLoading={isLoadingMerge}
              colorSchema="primary"
              onClick={async () => handleMergeUser(targetUsername)}
              className="mr-4"
            >
              Confirm
            </Button>
            <Button colorSchema="secondary" variant="plain" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
