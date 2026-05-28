import { Tabs, TabsList, TabsTrigger } from "@app/components/v3";

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
    <Tabs value={value} onValueChange={(next) => onChange(next as ProjectListView)}>
      <TabsList variant="filled">
        <TabsTrigger value={ProjectListView.MyProjects}>My Projects</TabsTrigger>
        <TabsTrigger value={ProjectListView.AllProjects}>All Projects</TabsTrigger>
      </TabsList>
    </Tabs>
  );
};
