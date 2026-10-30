import { Pending } from "../pending";

export const OrgIdentitiesTab = () => <Pending what="Organization machine identities" />;
export const OrgIdentityDetail = ({ id }: { id: string }) => (
  <Pending what={`Machine identity ${id}`} />
);
