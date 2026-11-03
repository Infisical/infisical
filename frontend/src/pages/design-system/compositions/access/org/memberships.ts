import {
  type AccessData,
  CURRENT_PROJECT_ID,
  type OrgProject,
  orgProjects,
  type ProjectRoleGrant
} from "../model";

export type MembershipSubject = "user" | "identity" | "group";

export type ProjectMembershipRow = {
  id: string;
  project: OrgProject;
  roles: string[];
  createdAt: string;
};

export const ADDED_TODAY = "Oct 30, 2026";

const currentProjectGrant = (data: AccessData, subject: MembershipSubject, subjectId: string) => {
  if (subject === "user") return data.projectMembers.find((m) => m.userId === subjectId);
  if (subject === "identity") return data.projectIdentities.find((m) => m.identityId === subjectId);
  return data.projectGroups.find((m) => m.groupId === subjectId);
};

const projectById = (id: string) => orgProjects.find((project) => project.id === id);

export const listProjectMemberships = (
  data: AccessData,
  subject: MembershipSubject,
  subjectId: string
): ProjectMembershipRow[] => {
  const current = currentProjectGrant(data, subject, subjectId);
  const currentProject = projectById(CURRENT_PROJECT_ID);
  const rows: ProjectMembershipRow[] = [
    ...(current && currentProject
      ? [
          {
            id: `${CURRENT_PROJECT_ID}-${subjectId}`,
            project: currentProject,
            roles: current.roles.map((grant) => grant.role),
            createdAt: current.createdAt
          }
        ]
      : []),
    ...data.otherProjectMemberships
      .filter((m) => m.subject === subject && m.subjectId === subjectId)
      .flatMap((m) => {
        const project = projectById(m.projectId);
        return project ? [{ id: m.id, project, roles: m.roles, createdAt: m.createdAt }] : [];
      })
  ];
  return rows.filter((row) => row.project.type !== "cert-manager");
};

export const addProjectMembership = (
  data: AccessData,
  subject: MembershipSubject,
  subjectId: string,
  projectId: string,
  role: string
): AccessData => {
  if (projectId !== CURRENT_PROJECT_ID)
    return {
      ...data,
      otherProjectMemberships: [
        ...data.otherProjectMemberships,
        {
          id: `opm-${crypto.randomUUID()}`,
          projectId,
          subject,
          subjectId,
          roles: [role],
          createdAt: ADDED_TODAY
        }
      ]
    };
  const roles: ProjectRoleGrant[] = [{ id: crypto.randomUUID(), role, isTemporary: false }];
  if (subject === "user")
    return {
      ...data,
      projectMembers: [
        ...data.projectMembers,
        { id: `pm-${subjectId}`, userId: subjectId, roles, createdAt: ADDED_TODAY }
      ]
    };
  if (subject === "identity")
    return {
      ...data,
      projectIdentities: [
        ...data.projectIdentities,
        { identityId: subjectId, roles, createdAt: ADDED_TODAY }
      ]
    };
  return {
    ...data,
    projectGroups: [...data.projectGroups, { groupId: subjectId, roles, createdAt: ADDED_TODAY }]
  };
};

export const removeProjectMembership = (
  data: AccessData,
  subject: MembershipSubject,
  subjectId: string,
  projectId?: string
): AccessData => {
  const next = {
    ...data,
    otherProjectMemberships: data.otherProjectMemberships.filter(
      (m) =>
        !(
          m.subject === subject &&
          m.subjectId === subjectId &&
          (projectId === undefined || m.projectId === projectId)
        )
    )
  };
  if (projectId !== undefined && projectId !== CURRENT_PROJECT_ID) return next;
  if (subject === "user")
    return { ...next, projectMembers: next.projectMembers.filter((m) => m.userId !== subjectId) };
  if (subject === "identity")
    return {
      ...next,
      projectIdentities: next.projectIdentities.filter((m) => m.identityId !== subjectId)
    };
  return { ...next, projectGroups: next.projectGroups.filter((m) => m.groupId !== subjectId) };
};

export const reapIdentity = (data: AccessData, identityId: string): AccessData => {
  const next = removeProjectMembership(data, "identity", identityId);
  return {
    ...next,
    orgIdentities: next.orgIdentities.filter((identity) => identity.id !== identityId),
    orgGroups: next.orgGroups.map((group) =>
      group.identityIds?.includes(identityId)
        ? { ...group, identityIds: group.identityIds.filter((id) => id !== identityId) }
        : group
    ),
    identityAuthTemplates: next.identityAuthTemplates.map((template) => ({
      ...template,
      usages: template.usages.filter((id) => id !== identityId)
    }))
  };
};

export const reapGroup = (data: AccessData, groupId: string): AccessData => {
  const next = removeProjectMembership(data, "group", groupId);
  return {
    ...next,
    orgGroups: next.orgGroups.filter((group) => group.id !== groupId),
    orgMembers: next.orgMembers.map((member) => ({
      ...member,
      groups: member.groups.filter((group) => group.id !== groupId)
    }))
  };
};
