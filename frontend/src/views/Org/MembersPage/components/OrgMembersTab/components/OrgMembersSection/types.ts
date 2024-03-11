import { ChangeEventHandler } from "react";

export type ProjectProps = {
  id: string;
  name: string;
};

export type CheckedProjectsMap = Record<string, boolean>;

export type ProjectsTableProps = {
  projects: Array<ProjectProps>;
  userProjects: Array<ProjectProps>;
  checkedProjects: CheckedProjectsMap;
  setCheckedProjects: (value: CheckedProjectsMap) => void;
};

export type SearchProjectProps = {
  onSearch: ChangeEventHandler<HTMLInputElement>;
  searchValue: string;
  placeholder: string;
};

export type OnCheckProjectProps = {
  isChecked: boolean | string;
  project: ProjectProps;
};
