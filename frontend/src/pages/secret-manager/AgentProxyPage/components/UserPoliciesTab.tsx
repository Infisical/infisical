import { useState } from "react";
import {
  FlaskConicalIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UserIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OverflowBadgeList,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import { TUserPolicy, useDeleteUserPolicy, useGetUserPolicies } from "@app/hooks/api/userPolicies";

import { PolicyRulesHoverCard } from "./PolicyRulesHoverCard";
import { PolicySimulationModal } from "./PolicySimulationModal";
import { PolicyTargetCell } from "./PolicyTargetCell";
import { UserPolicySheet } from "./UserPolicySheet";

export const UserPoliciesTab = () => {
  const { projectId } = useProject();
  const [search, setSearch] = useState("");

  const { data: policies, isPending } = useGetUserPolicies(projectId);
  const deletePolicy = useDeleteUserPolicy();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "policyForm",
    "deletePolicy",
    "testPolicy"
  ] as const);

  const handleDelete = async () => {
    const policy = popUp.deletePolicy.data as TUserPolicy;
    try {
      await deletePolicy.mutateAsync({ policyId: policy.id, projectId });
      handlePopUpToggle("deletePolicy", false);
      createNotification({ type: "success", text: "Successfully deleted user policy" });
    } catch {
      // The shared mutation error handler surfaces the API error.
    }
  };

  const filtered = policies?.filter((policy) =>
    policy.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Policies</CardTitle>
        <CardDescription>
          What a person may do through an agent. A request has to pass both sides.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.UserPolicies}
          >
            {(isAllowed: boolean) => (
              <Button
                variant="project"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("policyForm")}
              >
                <PlusIcon />
                Add Policy
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <InputGroup className="mb-4">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user policies..."
          />
        </InputGroup>
        {!isPending && !filtered?.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {policies?.length ? <SearchIcon /> : <UserIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {policies?.length ? "No policies match your search" : "No user policies yet"}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="min-w-[56rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-64">
                  <TableHeadLabel>Name</TableHeadLabel>
                </TableHead>
                <TableHead className="w-44">
                  <TableHeadLabel>Target</TableHeadLabel>
                </TableHead>
                <TableHead className="w-72">
                  <TableHeadLabel>Users</TableHeadLabel>
                </TableHead>
                <TableHead className="w-28">
                  <TableHeadLabel>Rules</TableHeadLabel>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                ["first", "second", "third"].map((row) => (
                  <TableRow key={`user-policy-skeleton-${row}`}>
                    {["name", "target", "users", "rules", "actions"].map((cell) => (
                      <TableCell key={`user-policy-skeleton-${row}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {filtered?.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="truncate">{policy.name}</TableCell>
                  <TableCell>
                    <PolicyTargetCell target={policy.target} />
                  </TableCell>
                  <TableCell>
                    <OverflowBadgeList
                      items={policy.users}
                      getKey={(user) => user.userId}
                      getLabel={(user) => user.username}
                    />
                  </TableCell>
                  <TableCell>
                    <PolicyRulesHoverCard rules={policy.rules} />
                  </TableCell>
                  <TableCell className="w-12">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton aria-label="Policy options" variant="ghost" size="xs">
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Reading the agent side is what the test reconciles against. */}
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Read}
                          a={ProjectPermissionSub.AgentPolicies}
                        >
                          {(isAllowed: boolean) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={() => handlePopUpOpen("testPolicy", policy)}
                            >
                              <FlaskConicalIcon />
                              Test Request
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.UserPolicies}
                        >
                          {(isAllowed: boolean) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={() => handlePopUpOpen("policyForm", policy)}
                            >
                              <PencilIcon />
                              Edit Policy
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.UserPolicies}
                        >
                          {(isAllowed: boolean) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              variant="danger"
                              onClick={() => handlePopUpOpen("deletePolicy", policy)}
                            >
                              <TrashIcon />
                              Delete Policy
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <AlertDialog
          open={popUp.deletePolicy.isOpen}
          onOpenChange={(open) => handlePopUpToggle("deletePolicy", open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User Policy?</AlertDialogTitle>
              <AlertDialogDescription>
                The people named by{" "}
                <span className="text-foreground">
                  {(popUp.deletePolicy.data as TUserPolicy)?.name}
                </span>{" "}
                lose whatever this policy allowed them to do through an agent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>This cannot be undone.</AlertDescription>
            </Alert>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={deletePolicy.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={deletePolicy.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  handleDelete();
                }}
              >
                Delete Policy
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <UserPolicySheet
          isOpen={popUp.policyForm.isOpen}
          policy={popUp.policyForm.data as TUserPolicy | undefined}
          onOpenChange={(isOpen) => handlePopUpToggle("policyForm", isOpen)}
        />
        <PolicySimulationModal
          isOpen={popUp.testPolicy.isOpen}
          userPolicy={popUp.testPolicy.data as TUserPolicy | undefined}
          onOpenChange={(isOpen) => handlePopUpToggle("testPolicy", isOpen)}
        />
      </CardContent>
    </Card>
  );
};
