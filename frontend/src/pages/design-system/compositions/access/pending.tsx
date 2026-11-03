import { EmptyState } from "@app/components/v4/ui/empty";

export const Pending = ({ what }: { what: string }) => (
  <EmptyState icon="clock" title={`${what} is being ported`} />
);
