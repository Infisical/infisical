import { useState } from "react";
import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import { CheckIcon, CircleXIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AccessRestrictedNotice,
  Alert,
  AlertAction,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import {
  useDeleteDynamicSecretUserCredential,
  useListDynamicSecretUserCredentials
} from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { DynamicSecretUserCredentialStatus } from "@app/hooks/api/dynamicSecretUserCredential/types";

type Props = {
  dynamicSecret: TDynamicSecret;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

const RelativeTime = ({ value, fallback }: { value?: string | null; fallback: string }) => {
  if (!value) return <span className="text-muted">{fallback}</span>;
  const date = new Date(value);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{formatDistance(date, new Date(), { addSuffix: true })}</span>
      </TooltipTrigger>
      <TooltipContent>{format(date, "yyyy-MM-dd, hh:mm aaa")}</TooltipContent>
    </Tooltip>
  );
};

export const DynamicSecretUserCredentials = ({
  dynamicSecret,
  projectSlug,
  environment,
  secretPath
}: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const { permission } = useProjectPermission();
  const permissionSubject = subject(ProjectPermissionSub.DynamicSecrets, {
    environment,
    secretPath,
    metadata: dynamicSecret.metadata
  });
  const canManage = permission.can(
    ProjectPermissionDynamicSecretActions.ManageUserCredentials,
    permissionSubject
  );

  const location = {
    dynamicSecretName: dynamicSecret.name,
    projectSlug,
    environmentSlug: environment,
    path: secretPath
  };

  const { data, isPending, isError, refetch } = useListDynamicSecretUserCredentials({
    ...location,
    offset: (page - 1) * perPage,
    limit: perPage,
    enabled: canManage
  });
  const deleteUserCredential = useDeleteDynamicSecretUserCredential();

  const handleDelete = async () => {
    if (!userToDelete || deleteUserCredential.isPending) return;
    const { isRefreshTokenRevoked } = await deleteUserCredential.mutateAsync({
      ...location,
      externalUserId: userToDelete
    });
    createNotification({
      type: isRefreshTokenRevoked ? "success" : "warning",
      text: isRefreshTokenRevoked
        ? `Tokens for "${userToDelete}" deleted`
        : `Tokens for "${userToDelete}" deleted, but the authorization server didn't confirm it revoked the refresh token`
    });
    setUserToDelete(null);
  };

  if (!canManage) {
    return (
      <AccessRestrictedNotice
        title="Access Restricted"
        description="You need permission to manage user tokens on this dynamic secret."
      />
    );
  }

  if (isError) {
    return (
      <Alert variant="danger">
        <CircleXIcon />
        <AlertTitle>Could not load user tokens.</AlertTitle>
        <AlertDescription>
          Try loading the stored user tokens again.
          <AlertAction>
            <Button variant="outline" size="xs" onClick={() => refetch().catch(() => undefined)}>
              Retry
            </Button>
          </AlertAction>
        </AlertDescription>
      </Alert>
    );
  }

  if (!isPending && !data?.totalCount) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No user tokens stored</EmptyTitle>
          <EmptyDescription>
            Your application stores each user&apos;s tokens through the API after the user
            authorizes it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Access Token Expires</TableHead>
            <TableHead>Last Refreshed</TableHead>
            <TableHead variant="action" aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending &&
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={`user-credential-loading-${index + 1}`}>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell variant="action">
                  <Skeleton className="ml-auto size-7" />
                </TableCell>
              </TableRow>
            ))}
          {(data?.userCredentials ?? []).map(
            ({
              id,
              externalUserId,
              status,
              statusDetails,
              accessTokenExpiresAt,
              lastRefreshedAt
            }) => (
              <TableRow key={id}>
                <TableCell className="max-w-56 font-mono">
                  <span className="block truncate">{externalUserId}</span>
                </TableCell>
                <TableCell>
                  {status === DynamicSecretUserCredentialStatus.ReauthorizationRequired ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="danger">
                          <TriangleAlertIcon />
                          Needs Reauthorization
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        {statusDetails ||
                          "The authorization server rejected the stored refresh token."}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge variant="success">
                      <CheckIcon />
                      Active
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <RelativeTime value={accessTokenExpiresAt} fallback="Unknown" />
                </TableCell>
                <TableCell>
                  <RelativeTime value={lastRefreshedAt} fallback="Never" />
                </TableCell>
                <TableCell variant="action">
                  <ProjectPermissionCan
                    I={ProjectPermissionDynamicSecretActions.ManageUserCredentials}
                    a={permissionSubject}
                    renderTooltip
                    allowedLabel="Delete user tokens"
                  >
                    {(isAllowed) => (
                      <IconButton
                        aria-label={`Delete tokens for ${externalUserId}`}
                        variant="ghost-muted"
                        size="xs"
                        isDisabled={!isAllowed}
                        onClick={() => setUserToDelete(externalUserId)}
                      >
                        <Trash2Icon />
                      </IconButton>
                    )}
                  </ProjectPermissionCan>
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
      {Boolean(data?.totalCount) && (
        <Pagination
          count={data?.totalCount ?? 0}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={(newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
          }}
        />
      )}

      <AlertDialog
        isPending={deleteUserCredential.isPending}
        open={Boolean(userToDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setUserToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Tokens for &quot;{userToDelete}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Infisical revokes this user&apos;s refresh token and deletes the stored tokens. The
              user has to authorize your application again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={(event) => {
                event.preventDefault();
                handleDelete().catch(() => undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
