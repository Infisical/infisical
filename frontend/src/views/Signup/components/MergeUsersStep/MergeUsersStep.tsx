import { useRouter } from "next/router";
import { faUsers } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  EmptyState,
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

type Props = {
  username: string;
};

export const MergeUsersStep = ({ username }: Props) => {
  const router = useRouter();
  const { data: users, isLoading: isLoadingUsers } = useListUsersWithMyEmail();
  const { mutateAsync: mergeUser, isLoading: isLoadingMerge } = useMergeUsers();
  const handleMergeUser = async (targetUsername: string) => {
    try {
      console.log("merge A");
      await mergeUser({ username: targetUsername });
      // TODO: logout, make user re-login
      console.log("merge B");

      createNotification({
        text: "Successfully merged user",
        type: "success"
      });

      router.push("/login");
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
                      <Td>{username}</Td>
                      <Td>
                        <Button
                          isLoading={isLoadingMerge}
                          colorSchema="primary"
                          variant="outline_bg"
                          type="submit"
                          onClick={() => handleMergeUser(user.username)}
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
    </div>
  );
};
