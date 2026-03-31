import { useMemo, useState } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { Input } from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { usePopUp } from "@app/hooks";

import { MOCK_ROTATION_POLICIES, ROTATION_POLICY_TYPE_MAP } from "../mock-data";
import { PamAddRotationPolicyModal } from "./PamAddRotationPolicyModal";

export const PamRotationsSection = () => {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addPolicy"] as const);

  const policies = useMemo(() => {
    if (!search.trim()) return MOCK_ROTATION_POLICIES;
    const s = search.toLowerCase();
    return MOCK_ROTATION_POLICIES.filter((p) => p.name.toLowerCase().includes(s));
  }, [search]);

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search rotation policies..."
          className="h-full flex-1"
          containerClassName="h-9"
        />
        <Button variant="project" onClick={() => handlePopUpOpen("addPolicy")}>
          <PlusIcon />
          Add Rotation Policy
        </Button>
      </div>

      <div className="mt-4">
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Schedule</UnstableTableHead>
              <UnstableTableHead>Status</UnstableTableHead>
              <UnstableTableHead>Last Run</UnstableTableHead>
              <UnstableTableHead>Next Run</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {policies.length === 0 && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={6}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>
                        {search ? "No rotation policies match search" : "No rotation policies"}
                      </UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {policies.map((policy) => {
              const typeInfo = ROTATION_POLICY_TYPE_MAP[policy.type];
              return (
                <UnstableTableRow
                  key={policy.id}
                  className="group cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/projects/pam/$projectId/rotations/$rotationPolicyId",
                      params: {
                        orgId: currentOrg.id,
                        projectId: currentProject.id,
                        rotationPolicyId: policy.id
                      }
                    })
                  }
                >
                  <UnstableTableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <img
                        alt={typeInfo.name}
                        src={`/images/integrations/${typeInfo.image}`}
                        className="size-5"
                      />
                      {policy.name}
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell className="text-muted">{typeInfo.name}</UnstableTableCell>
                  <UnstableTableCell className="text-muted">
                    Every {policy.scheduleDays} days
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <Badge variant={policy.status === "active" ? "success" : "neutral"}>
                      {policy.status}
                    </Badge>
                  </UnstableTableCell>
                  <UnstableTableCell className="text-muted">{policy.lastRun}</UnstableTableCell>
                  <UnstableTableCell className="text-muted">{policy.nextRun}</UnstableTableCell>
                </UnstableTableRow>
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
      </div>

      <PamAddRotationPolicyModal
        isOpen={popUp.addPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addPolicy", isOpen)}
      />
    </div>
  );
};
