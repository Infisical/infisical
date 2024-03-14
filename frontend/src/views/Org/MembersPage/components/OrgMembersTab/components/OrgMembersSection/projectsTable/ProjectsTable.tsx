import { ChangeEventHandler, FC } from "react";
import { faProjectDiagram } from "@fortawesome/free-solid-svg-icons";

import {
  Checkbox,
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

import { CheckedProjectsMap, OnCheckProjectProps, ProjectsTableProps } from "../types";
import monitorCheckAll from "./monitorCheckAll";
import SearchProjects from "./SearchProjects";

const ProjectsTable: FC<ProjectsTableProps> = ({
  projects,
  checkedProjects,
  setCheckedProjects,
  searchValue,
  setSearchValue
}) => {
  const isLoading = false;

  const onSearch: ChangeEventHandler<HTMLInputElement> = (e) => {
    const { value } = e.target;

    setSearchValue(value);
  };

  const onToggleCheckAll = (hasAllChecked: boolean) => {
    const newState: CheckedProjectsMap = {};

    Object.keys(checkedProjects).forEach((projectKey: string) => {
      newState[projectKey] = hasAllChecked;
    });

    setCheckedProjects({ ...newState });
  };

  const onCheckProject = ({ isChecked, project }: OnCheckProjectProps): void => {
    if (isChecked) {
      const newState: CheckedProjectsMap = {
        ...checkedProjects,
        [project.id]: true
      };

      setCheckedProjects({
        ...monitorCheckAll({ state: newState })
      });
      return;
    }

    setCheckedProjects({
      ...checkedProjects,
      [project.id]: false,
      all: false
    });
  };

  return (
    <div>
      <SearchProjects onSearch={onSearch} searchValue={searchValue} placeholder="Search projects" />
      <TableContainer className="mt-4 max-h-80">
        <Table>
          <THead>
            <Tr>
              <Th>
                <Checkbox
                  id="check-all-projects"
                  isChecked={checkedProjects.all}
                  onCheckedChange={onToggleCheckAll}
                  isDisabled={false}
                />
              </Th>
              <Th>Name</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={5} innerKey="org-projects" />}
            {!isLoading &&
              projects?.map((project) => {
                const { name, id } = project;

                return (
                  <Tr key={`org-project-${id}`} className="w-full">
                    <Td>
                      <Checkbox
                        id={`check-project-${id}`}
                        isChecked={checkedProjects[project.id]}
                        onCheckedChange={(isChecked) => onCheckProject({ isChecked, project })}
                        isDisabled={false}
                      />
                    </Td>
                    <Td>{name}</Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isLoading && projects?.length === 0 && (
          <EmptyState title="No projects found" icon={faProjectDiagram} />
        )}
      </TableContainer>
    </div>
  );
};

export default ProjectsTable;
