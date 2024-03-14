import { ProjectProps } from "@app/hooks/api/users/types";

const ProjectsCell = ({ projects }: { projects: ProjectProps[] }) => {
  return <span>{projects?.join(", ")}</span>;
};

export default ProjectsCell;
