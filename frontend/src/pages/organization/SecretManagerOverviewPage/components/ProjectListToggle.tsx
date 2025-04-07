import { Select, SelectItem } from "@app/components/v2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

export enum ProjectListView {
  MyProjects = "my-projects",
  AllProjects = "all-projects"
}

type Props = {
  value: ProjectListView;
  onChange: (value: ProjectListView) => void;
};

export const ProjectListToggle = ({ value, onChange }: Props) => {
  const getDisplayText = (value: ProjectListView) => {
    return value === ProjectListView.MyProjects ? "My Projects" : "All Projects";
  };

  return (
    <div className="flex items-center gap-2 relative group cursor-pointer">
      <h1 className="text-3xl font-semibold group-hover:text-gray-500 transition-colors">{getDisplayText(value)}</h1>
      <Select value={value} onValueChange={onChange} className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer">
        <SelectItem value={ProjectListView.MyProjects}>My Projects</SelectItem>
        <SelectItem value={ProjectListView.AllProjects}>All Projects</SelectItem>
      </Select>
      <FontAwesomeIcon icon={faChevronDown} className="group-hover:text-gray-500 transition-colors text-lg" />
    </div>
  );
};
