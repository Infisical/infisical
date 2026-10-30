import { Pending } from "../pending";

export const OrgGroupsTab = () => <Pending what="Organization groups" />;
export const OrgGroupDetail = ({ id }: { id: string }) => <Pending what={`Group ${id}`} />;
