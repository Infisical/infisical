import { useMemo, useState } from "react";
import {
  faCircleInfo,
  faClone,
  faMagnifyingGlass,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Input,
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
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { TProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

import { DeleteProjectTemplateModal } from "./DeleteProjectTemplateModal";

type Props = {
  onEdit: (projectTemplate: TProjectTemplate) => void;
};

export const ProjectTemplatesTable = ({ onEdit }: Props) => {
  const { subscription } = useSubscription();

  const { isPending, data: projectTemplates = [] } = useListProjectTemplates({
    enabled: subscription?.projectTemplates
  });

  const [search, setSearch] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteTemplate"] as const);

  const filteredTemplates = useMemo(
    () =>
      projectTemplates?.filter((template) =>
        template.name.toLowerCase().includes(search.toLowerCase().trim())
      ) ?? [],
    [search, projectTemplates]
  );

  const colSpan = 7;

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search templates..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Roles</Th>
              <Th>Users</Th>
              <Th>Groups</Th>
              <Th>Identities</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {subscription?.projectTemplates && isPending && (
              <TableSkeleton
                innerKey="project-templates-table"
                columns={colSpan}
                key="project-templates"
              />
            )}
            {filteredTemplates.map((template) => {
              const {
                id,
                name,
                roles,
                description,
                type,
                users,
                groups,
                identities,
                projectManagedIdentities
              } = template;

              const totalIdentities =
                (identities?.length || 0) + (projectManagedIdentities?.length || 0);

              return (
                <Tr
                  onClick={() => onEdit(template)}
                  className="cursor-pointer hover:bg-mineshaft-700"
                  key={id}
                >
                  <Td>
                    {name}
                    {description && (
                      <Tooltip content={description}>
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </Tooltip>
                    )}
                  </Td>
                  <Td>{getProjectTitle(type)}</Td>
                  <Td className="pl-8">
                    {roles.length}
                    {roles.length > 0 && (
                      <Tooltip
                        content={
                          <ul className="ml-2 list-disc">
                            {roles.map((role) => (
                              <li key={role.name}>{role.name}</li>
                            ))}
                          </ul>
                        }
                      >
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </Tooltip>
                    )}
                  </Td>
                  <Td className="pl-8">
                    {users?.length || 0}
                    {users && Boolean(users.length) && (
                      <Tooltip
                        content={
                          <ul className="ml-2 list-disc">
                            {users.map((user) => (
                              <li key={user.username}>{user.username}</li>
                            ))}
                          </ul>
                        }
                      >
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </Tooltip>
                    )}
                  </Td>
                  <Td className="pl-8">
                    {groups?.length || 0}
                    {groups && Boolean(groups.length) && (
                      <Tooltip
                        content={
                          <ul className="ml-2 list-disc">
                            {groups.map((group) => (
                              <li key={group.groupSlug}>{group.groupSlug}</li>
                            ))}
                          </ul>
                        }
                      >
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </Tooltip>
                    )}
                  </Td>
                  <Td className="pl-8">{totalIdentities}</Td>
                  <Td className="w-5">
                    {name !== "default" && (
                      <OrgPermissionCan
                        I={OrgPermissionActions.Delete}
                        a={OrgPermissionSubjects.ProjectTemplates}
                      >
                        {(isAllowed) => (
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("deleteTemplate", template);
                            }}
                            variant="plain"
                            colorSchema="danger"
                            ariaLabel="Delete template"
                            isDisabled={!isAllowed}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        )}
                      </OrgPermissionCan>
                    )}
                  </Td>
                </Tr>
              );
            })}
            {(!subscription?.projectTemplates ||
              (!isPending && filteredTemplates?.length === 0)) && (
              <Tr>
                <Td colSpan={colSpan}>
                  <EmptyState
                    title={
                      search.trim()
                        ? "No project templates match search"
                        : "No project templates found"
                    }
                    icon={faClone}
                  />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      <DeleteProjectTemplateModal
        isOpen={popUp.deleteTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteTemplate", isOpen)}
        template={popUp.deleteTemplate.data}
      />
    </div>
  );
};
