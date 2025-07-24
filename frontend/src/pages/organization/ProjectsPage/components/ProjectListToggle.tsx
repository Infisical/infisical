import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem } from "@app/components/v2";

export enum ProjectListView {
  MyProjects = "my-projects",
  AllProjects = "all-projects"
}

type Props = {
  value: ProjectListView;
  onChange: (value: ProjectListView) => void;
};

export const ProjectListToggle = ({ value, onChange }: Props) => {
  const getDisplayText = (listView: ProjectListView) => {
    return listView === ProjectListView.MyProjects ? "My Projects" : "All Projects";
  };

  return (
    <div className="group relative flex cursor-pointer items-center gap-2">
      <h1 className="text-3xl font-semibold transition-colors group-hover:text-gray-500">
        {getDisplayText(value)}
      </h1>
      <Select
        value={value}
        onValueChange={onChange}
        className="absolute left-0 top-0 h-full w-full cursor-pointer opacity-0"
        position="popper"
      >
        <SelectItem value={ProjectListView.MyProjects}>My Projects</SelectItem>
        <SelectItem value={ProjectListView.AllProjects}>All Projects</SelectItem>
      </Select>
      <FontAwesomeIcon
        icon={faChevronDown}
        className="text-lg transition-colors group-hover:text-gray-500"
      />
    </div>
  );
};
