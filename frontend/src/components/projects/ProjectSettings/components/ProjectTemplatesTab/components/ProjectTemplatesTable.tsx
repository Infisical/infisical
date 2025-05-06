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
import { useGetProjectTypeFromRoute, usePopUp } from "@app/hooks";
import { TProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

import { DeleteProjectTemplateModal } from "./DeleteProjectTemplateModal";

type Props = {
  onEdit: (projectTemplate: TProjectTemplate) => void;
};

export const ProjectTemplatesTable = ({ onEdit }: Props) => {
  const { subscription } = useSubscription();

  const projectType = useGetProjectTypeFromRoute();

  const { isPending, data: projectTemplates = [] } = useListProjectTemplates(projectType, {
    enabled: subscription?.projectTemplates && Boolean(projectType)
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

  const isSecretManagerTemplates = projectType === "secret-manager";

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
              <Th>Roles</Th>
              {isSecretManagerTemplates && <Th>Environments</Th>}
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && (
              <TableSkeleton
                innerKey="project-templates-table"
                columns={4}
                key="project-templates"
              />
            )}
            {filteredTemplates.map((template) => {
              const { id, name, roles, environments = [], description } = template;
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
                  {isSecretManagerTemplates && environments && (
                    <Td className="pl-14">
                      {environments.length}
                      {environments.length > 0 && (
                        <Tooltip
                          content={
                            <ul className="ml-2 list-disc">
                              {environments
                                .sort((a, b) => (a.position > b.position ? 1 : -1))
                                .map((env) => (
                                  <li key={env.slug}>{env.name}</li>
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
                  )}
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
            {!isPending && filteredTemplates?.length === 0 && (
              <Tr>
                <Td colSpan={5}>
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
