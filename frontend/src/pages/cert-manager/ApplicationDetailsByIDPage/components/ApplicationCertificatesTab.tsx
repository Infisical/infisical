import { useQuery } from "@tanstack/react-query";

import { Spinner } from "@app/components/v2";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";

type Props = { applicationId: string; projectId: string };

type ApplicationCertificate = {
  id: string;
  commonName: string;
  status: string;
  notBefore: string;
  notAfter: string;
  profileName?: string | null;
};

type SearchResponse = {
  certificates: ApplicationCertificate[];
  totalCount: number;
};

const statusVariant = (status: string): "success" | "danger" | "warning" | "neutral" => {
  if (status === "active") return "success";
  if (status === "revoked") return "danger";
  if (status === "expired") return "warning";
  return "neutral";
};

export const ApplicationCertificatesTab = ({ applicationId, projectId }: Props) => {
  const { data, isPending } = useQuery({
    queryKey: ["application-certs", { projectId, applicationId }] as const,
    queryFn: async () => {
      const { data: body } = await apiRequest.post<SearchResponse>(
        `/api/v1/projects/${projectId}/certificates/search`,
        { offset: 0, limit: 50, applicationId, sortBy: "notAfter", sortOrder: "desc" }
      );
      return body;
    },
    enabled: Boolean(projectId && applicationId)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificates</CardTitle>
        <CardDescription>
          Active and historical certificates issued through this Application&apos;s profiles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        )}
        {!isPending && (!data || data.certificates.length === 0) && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No certificates yet</EmptyTitle>
              <EmptyDescription>
                Certificates issued through this Application will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && data && data.certificates.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Common Name</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.certificates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell isTruncatable className="font-mono">
                    {c.commonName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.profileName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)} className="capitalize">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-accent">
                    {new Date(c.notBefore).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-accent">
                    {new Date(c.notAfter).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
