import { faCertificate } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "@tanstack/react-router";

import {
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
import { useOrganization } from "@app/context";
import { useGetTemplateUsages } from "@app/hooks/api/identityAuthTemplates";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
};

export const MachineAuthTemplateUsagesModal = ({
  isOpen,
  onClose,
  templateId,
  templateName
}: Props) => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

  const organizationId = currentOrg?.id || "";

  const { data: usages = [], isPending } = useGetTemplateUsages({
    templateId,
    organizationId
  });

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalContent title={`Usages for Identity Auth Template: ${templateName}`}>
        <div>
          <TableContainer>
            <Table>
              <THead>
                <Tr className="h-14">
                  <Th>Identity Name</Th>
                  <Th>Identity ID</Th>
                </Tr>
              </THead>
              <TBody>
                {isPending && <TableSkeleton columns={3} innerKey="template-usages" />}
                {!isPending &&
                  usages.map((usage) => (
                    <Tr
                      className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      key={`usage-${usage.identityId}`}
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/identities/$identityId",
                          params: {
                            identityId: usage.identityId,
                            orgId: organizationId
                          }
                        })
                      }
                    >
                      <Td>{usage.identityName}</Td>
                      <Td>
                        <span className="text-sm text-mineshaft-400">{usage.identityId}</span>
                      </Td>
                    </Tr>
                  ))}
              </TBody>
            </Table>
            {!isPending && usages.length === 0 && (
              <EmptyState
                title="This template is not currently being used by any identities"
                icon={faCertificate}
              />
            )}
          </TableContainer>
        </div>
      </ModalContent>
    </Modal>
  );
};
