import { Button } from "@app/components/v2";

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
    <div className="border-mineshaft-600 bg-mineshaft-800 flex gap-x-0.5 rounded-md border p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(ProjectListView.MyProjects);
        }}
        size="xs"
        className={`${
          value === ProjectListView.MyProjects ? "bg-mineshaft-500" : "bg-transparent"
        } hover:bg-mineshaft-600 min-w-[2.4rem] rounded border-none`}
      >
        My Projects
      </Button>
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(ProjectListView.AllProjects);
        }}
        size="xs"
        className={`${
          value === ProjectListView.AllProjects ? "bg-mineshaft-500" : "bg-transparent"
        } hover:bg-mineshaft-600 min-w-[2.4rem] rounded border-none`}
      >
        All Projects
      </Button>
    </div>
  );
};
