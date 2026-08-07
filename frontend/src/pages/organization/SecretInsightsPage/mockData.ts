import { IdentityAuthMethod } from "@app/hooks/api";

import {
  TAuthMethodUsage,
  TOrgCounts,
  TProjectsInsights,
  TSecretAccessVolume,
  TSecretsSummary,
  TStaticSecretUsage
} from "./types";

// Placeholder data until the cards are wired to the org insights endpoints.

export const MOCK_ORG_COUNTS: TOrgCounts = {
  projects: 35,
  secrets: 1284,
  environments: 96,
  rotations: 57
};

export const MOCK_SECRETS_SUMMARY: TSecretsSummary = {
  activeLeases: 342,
  users: 128,
  identities: 416
};

export const MOCK_PROJECTS_INSIGHTS: TProjectsInsights = {
  totalProjects: 35,
  projectsWithIssues: 9,
  projects: [
    {
      projectId: "00000000-0000-0000-0000-000000000001",
      projectName: "payments-api",
      projectSlug: "payments-api",
      totalSecrets: 86,
      severityScore: 96,
      warnings: {
        duplicatedSecrets: 4,
        staleSecrets: 23,
        failedRotations: 2,
        failedSyncs: 1,
        orphanedLeases: 3
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000002",
      projectName: "auth-service",
      projectSlug: "auth-service",
      totalSecrets: 112,
      severityScore: 74,
      warnings: {
        duplicatedSecrets: 6,
        staleSecrets: 18,
        failedRotations: 0,
        failedSyncs: 3,
        orphanedLeases: 0
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000003",
      projectName: "data-pipeline",
      projectSlug: "data-pipeline",
      totalSecrets: 64,
      severityScore: 68,
      warnings: {
        duplicatedSecrets: null,
        staleSecrets: 12,
        failedRotations: 1,
        failedSyncs: 0,
        orphanedLeases: 7
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000004",
      projectName: "infra-core",
      projectSlug: "infra-core",
      totalSecrets: 203,
      severityScore: 55,
      warnings: {
        duplicatedSecrets: 9,
        staleSecrets: 6,
        failedRotations: 0,
        failedSyncs: 2,
        orphanedLeases: 0
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000005",
      projectName: "billing-service",
      projectSlug: "billing-service",
      totalSecrets: 57,
      severityScore: 44,
      warnings: {
        duplicatedSecrets: 0,
        staleSecrets: 31,
        failedRotations: 0,
        failedSyncs: 0,
        orphanedLeases: 0
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000006",
      projectName: "ml-inference",
      projectSlug: "ml-inference",
      totalSecrets: 71,
      severityScore: 32,
      warnings: {
        duplicatedSecrets: 0,
        staleSecrets: 8,
        failedRotations: 0,
        failedSyncs: 1,
        orphanedLeases: 0
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000007",
      projectName: "staging-sandbox",
      projectSlug: "staging-sandbox",
      totalSecrets: 132,
      severityScore: 27,
      warnings: {
        duplicatedSecrets: 0,
        staleSecrets: 17,
        failedRotations: 0,
        failedSyncs: 0,
        orphanedLeases: 0
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000008",
      projectName: "web-frontend",
      projectSlug: "web-frontend",
      totalSecrets: 44,
      severityScore: 21,
      warnings: {
        duplicatedSecrets: 3,
        staleSecrets: 14,
        failedRotations: 0,
        failedSyncs: 0,
        orphanedLeases: 0
      }
    },
    {
      projectId: "00000000-0000-0000-0000-000000000009",
      projectName: "edge-gateway",
      projectSlug: "edge-gateway",
      totalSecrets: 92,
      severityScore: 12,
      warnings: {
        duplicatedSecrets: 12,
        staleSecrets: 0,
        failedRotations: 0,
        failedSyncs: 0,
        orphanedLeases: 1
      }
    }
  ]
};

export const MOCK_AUTH_METHOD_USAGE: TAuthMethodUsage = {
  isSupported: true,
  totalFetches: 48470,
  unknownCount: 1150,
  methods: [
    { authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, count: 19400 },
    { authMethod: IdentityAuthMethod.KUBERNETES_AUTH, count: 10400 },
    { authMethod: IdentityAuthMethod.AWS_AUTH, count: 6630 },
    { authMethod: IdentityAuthMethod.OIDC_AUTH, count: 4260 },
    { authMethod: IdentityAuthMethod.GCP_AUTH, count: 3790 },
    { authMethod: IdentityAuthMethod.TOKEN_AUTH, count: 2840 }
  ]
};

export const MOCK_STATIC_SECRET_USAGE: TStaticSecretUsage = {
  weeks: [
    { weekStart: "2026-05-18", totalSecrets: 24, isPartial: false },
    { weekStart: "2026-05-25", totalSecrets: 31, isPartial: false },
    { weekStart: "2026-06-01", totalSecrets: 18, isPartial: false },
    { weekStart: "2026-06-08", totalSecrets: 42, isPartial: false },
    { weekStart: "2026-06-15", totalSecrets: 37, isPartial: false },
    { weekStart: "2026-06-22", totalSecrets: 29, isPartial: false },
    { weekStart: "2026-06-29", totalSecrets: 46, isPartial: false },
    { weekStart: "2026-07-06", totalSecrets: 51, isPartial: false },
    { weekStart: "2026-07-13", totalSecrets: 34, isPartial: false },
    { weekStart: "2026-07-20", totalSecrets: 58, isPartial: false },
    { weekStart: "2026-07-27", totalSecrets: 63, isPartial: false },
    { weekStart: "2026-08-03", totalSecrets: 21, isPartial: true }
  ]
};

export const MOCK_ACCESS_VOLUME: TSecretAccessVolume = {
  isSupported: true,
  days: [
    { date: "2026-07-31", total: 2380 },
    { date: "2026-08-01", total: 1420 },
    { date: "2026-08-02", total: 1180 },
    { date: "2026-08-03", total: 3620 },
    { date: "2026-08-04", total: 3300 },
    { date: "2026-08-05", total: 4213 },
    { date: "2026-08-06", total: 3980 }
  ]
};
