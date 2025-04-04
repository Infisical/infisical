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
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectItem value={ProjectListView.MyProjects}>My Projects</SelectItem>
      <SelectItem value={ProjectListView.AllProjects}>All Projects</SelectItem>
    </Select>
  );
};
