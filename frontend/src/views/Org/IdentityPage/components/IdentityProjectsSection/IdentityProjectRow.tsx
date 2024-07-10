import { useRouter } from "next/router";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { IdentityMembership } from "@app/hooks/api/identities/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  membership: IdentityMembership;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromProject"]>,
    data?: {}
  ) => void;
};

const formatRoleName = (role: string, customRoleName?: string) => {
  if (role === ProjectMembershipRole.Custom) return customRoleName;
  if (role === ProjectMembershipRole.Admin) return "Admin";
  if (role === ProjectMembershipRole.Member) return "Developer";
  if (role === ProjectMembershipRole.Viewer) return "Viewer";
  if (role === ProjectMembershipRole.NoAccess) return "No access";
  return role;
};

export const IdentityProjectRow = ({
  membership: { id, createdAt, identity, project, roles },
  handlePopUpOpen
}: Props) => {
  const router = useRouter();
  return (
    <Tr
      className="group h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
      key={`identity-project-membership-${id}`}
      onClick={() => router.push(`/project/${project.id}/members`)}
    >
      <Td>{project.name}</Td>
      <Td>{`${formatRoleName(roles[0].role, roles[0].customRoleName)}${
        roles.length > 1 ? ` (+${roles.length - 1})` : ""
      }`}</Td>
      <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
      <Td>
        <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Tooltip content="Remove">
            <IconButton
              ariaLabel="copy icon"
              variant="plain"
              className="group relative"
              onClick={(e) => {
                e.stopPropagation();
                handlePopUpOpen("removeIdentityFromProject", {
                  identityId: identity.id,
                  identityName: identity.name,
                  projectId: project.id,
                  projectName: project.name
                });
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
