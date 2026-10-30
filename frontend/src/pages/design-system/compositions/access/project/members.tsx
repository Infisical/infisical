import { Pending } from "../pending";

export const ProjectMembersTab = () => <Pending what="Project users" />;
export const ProjectMemberDetail = ({ id }: { id: string }) => (
  <Pending what={`Project user ${id}`} />
);
