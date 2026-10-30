import { Pending } from "../pending";

export const ProjectGroupsTab = () => <Pending what="Project groups" />;
export const ProjectGroupDetail = ({ id }: { id: string }) => <Pending what={`Group ${id}`} />;
