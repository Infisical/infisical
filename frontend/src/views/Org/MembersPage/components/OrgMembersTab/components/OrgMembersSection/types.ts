import { ChangeEventHandler } from "react";

import { Organization } from "@app/hooks/api/types";
import { ProjectProps } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

export enum CheckboxKeys {
  ALL = "all"
}

export type DataProps = {
  email: string;
  projects: string[];
};
export type CheckedProjectsMap = Record<string, boolean>;

export type ProjectsTableProps = {
  projects: ProjectProps[];
  preservedCheckedProjects: CheckedProjectsMap;
  setCheckedProjects: (value: CheckedProjectsMap) => void;
  searchValue: string;
  setSearchValue: (value: string) => void;
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

export type Props = {
  popUp: UsePopUpState<["addProject"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addProject"]>, state?: boolean) => void;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addProject"]>) => void;
};

export type OrgMembersTableProps = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMember", "upgradePlan"]>,
    data?: {
      orgMembershipId?: string;
      username?: string;
      description?: string;
    }
  ) => void;
  setCompleteInviteLink: (link: string) => void;
};

export type AddProjectProps = {
  handlePopUpOpen: any;
  currentOrg: Organization | undefined;
  createNotification: any;
  orgMembershipId: string;
  email: string;
  projects: ProjectProps[];
};

export type UseFilteredProjectsProps = {
  userProjects: string[];
  workspaces: ProjectProps[];
};
