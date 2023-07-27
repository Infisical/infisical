import { faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["updateEnv", "deleteEnv", "upgradePlan"]>,
    {
      name,
      slug
    }: {
      name: string;
      slug: string;
    }
  ) => void;
};

export const EnvironmentTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace, isLoading } = useWorkspace();
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th aria-label="button" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="project-envs" />}
          {!isLoading &&
            currentWorkspace &&
            currentWorkspace.environments.map(({ name, slug }) => (
              <Tr key={name}>
                <Td>{name}</Td>
                <Td>{slug}</Td>
                <Td className="flex items-center justify-end">
                  <IconButton
                    className="mr-3 py-2"
                    onClick={() => {
                      handlePopUpOpen("updateEnv", { name, slug });
                    }}
                    colorSchema="primary"
                    variant="plain"
                    ariaLabel="update"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </IconButton>
                  <IconButton
                    onClick={() => {
                      handlePopUpOpen("deleteEnv", { name, slug });
                    }}
                    size="lg"
                    colorSchema="danger"
                    variant="plain"
                    ariaLabel="update"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </IconButton>
                </Td>
              </Tr>
            ))}
          {!isLoading && currentWorkspace && currentWorkspace.environments?.length === 0 && (
            <Tr>
              <Td colSpan={3}>
                <EmptyState title="No environments found" />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
