import { ChangeEventHandler, FC, useEffect, useState } from "react";
import { faMagnifyingGlass, faProjectDiagram } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Checkbox,
  EmptyState,
  Input,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";

import {
  CheckedProjectsMap,
  OnCheckProjectProps,
  ProjectProps,
  ProjectsTableProps,
  SearchProjectProps
} from "./types";

const SearchProjects: FC<SearchProjectProps> = ({ onSearch, searchValue, placeholder = "" }) => {
  return (
    <Input
      value={searchValue}
      onChange={onSearch}
      leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
      placeholder={placeholder}
    />
  );
};

const monitorCheckAll = ({ state }: { state: CheckedProjectsMap }): CheckedProjectsMap => {
  const newState = { ...state };
  // check if all projects are enabled to check all checkbox programmatically
  const { all, ...projects } = newState;
  const numOfProjects = Object.keys(projects).length;

  let numOfCheckedProjects: number = 0;
  Object.keys(projects).forEach((projectKey) => {
    if (projects[projectKey]) {
      numOfCheckedProjects += 1;
    }
  });

  if (numOfProjects === numOfCheckedProjects) {
    newState.all = true;
  }

  return newState;
};

const ProjectsTable: FC<ProjectsTableProps> = ({
  projects,
  userProjects,
  checkedProjects,
  setCheckedProjects
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [filteredProjects, setFilteredProjects] = useState<Array<ProjectProps>>([]);

  const isLoading = false;

  useEffect(() => {
    const filtered = projects.filter((project) => {
      const projectAlreadyExist = userProjects.join(",").indexOf(project.name) >= 0;

      return project.name.includes(searchValue) && !projectAlreadyExist;
    });

    setFilteredProjects([...filtered]);
  }, [searchValue]);

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
      <TableContainer className="mt-4">
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
              filteredProjects?.map((project) => {
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
        {!isLoading && filteredProjects?.length === 0 && (
          <EmptyState title="No projects found" icon={faProjectDiagram} />
        )}
      </TableContainer>
    </div>
  );
};

export default ProjectsTable;
