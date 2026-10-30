import { Pending } from "../pending";

export const ProjectIdentitiesTab = () => <Pending what="Project machine identities" />;
export const ProjectIdentityDetail = ({ id }: { id: string }) => (
  <Pending what={`Machine identity ${id}`} />
);
