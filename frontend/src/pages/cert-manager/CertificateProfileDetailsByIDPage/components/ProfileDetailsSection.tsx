import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfileWithDetails
} from "@app/hooks/api/certificateProfiles";

type Props = {
  profile: TCertificateProfileWithDetails;
};

const enrollmentTypeLabels: Record<EnrollmentType, string> = {
  [EnrollmentType.API]: "API",
  [EnrollmentType.EST]: "EST",
  [EnrollmentType.ACME]: "ACME",
  [EnrollmentType.SCEP]: "SCEP"
};

const issuerTypeLabels: Record<IssuerType, string> = {
  [IssuerType.CA]: "Certificate Authority",
  [IssuerType.SELF_SIGNED]: "Self-Signed"
};

export const ProfileDetailsSection = ({ profile }: Props) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardDescription>Certificate profile details</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{profile.slug}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Profile ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="break-all">{profile.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      navigator.clipboard.writeText(profile.id);
                      setCopyTextId("Copied");
                    }}
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopyingId ? "Copied" : "Copy ID to clipboard"}</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>

          {profile.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{profile.description}</DetailValue>
            </Detail>
          )}

          <Detail>
            <DetailLabel>Enrollment Type</DetailLabel>
            <DetailValue>
              <Badge variant="info">{enrollmentTypeLabels[profile.enrollmentType]}</Badge>
            </DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Issuer Type</DetailLabel>
            <DetailValue>
              <Badge
                variant={profile.issuerType === IssuerType.SELF_SIGNED ? "warning" : "neutral"}
              >
                {issuerTypeLabels[profile.issuerType]}
              </Badge>
            </DetailValue>
          </Detail>

          {profile.createdAt && (
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>
                {format(new Date(profile.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}

          {profile.updatedAt && (
            <Detail>
              <DetailLabel>Last Updated</DetailLabel>
              <DetailValue>
                {format(new Date(profile.updatedAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
