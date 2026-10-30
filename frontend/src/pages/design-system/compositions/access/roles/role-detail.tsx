import { Pending } from "../pending";

export const OrgRoleDetail = ({ id }: { id: string }) => (
  <Pending what={`Organization role ${id}`} />
);
export const ProjectRoleDetail = ({ id }: { id: string }) => (
  <Pending what={`Project role ${id}`} />
);
