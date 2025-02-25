import { OpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import z from "zod";

import { ActionProjectType, TAuditLogs } from "@app/db/schemas";
import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { AuthMethod } from "../auth/auth-type";
import { TOrgDALFactory } from "../org/org-dal";
import { TAutomatedSecurityReportDALFactory } from "./automated-security-report-dal";
import { TIdentityProfileDALFactory } from "./identity-profile-dal";

type TAutomatedSecurityServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  automatedSecurityReportDAL: TAutomatedSecurityReportDALFactory;
  permissionService: TPermissionServiceFactory;
  identityProfileDAL: TIdentityProfileDALFactory;
  queueService: Pick<TQueueServiceFactory, "start" | "listen" | "queue" | "stopJobById" | "stopRepeatableJob">;
  orgDAL: TOrgDALFactory;
};

export type TAutomatedSecurityServiceFactory = ReturnType<typeof automatedSecurityServiceFactory>;

export const ProfileIdentityResponseSchema = z.object({
  temporalProfile: z.string(),
  scopeProfile: z.string(),
  usageProfile: z.string()
});

enum AnomalySeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  NONE = "NONE"
}

export const AnomalyResponseSchema = z.object({
  results: z
    .object({
      auditLogId: z.string(),
      reason: z.string(),
      severity: z.nativeEnum(AnomalySeverity),
      isAnomalous: z.boolean()
    })
    .array()
});

export const CaslRuleAnalysisSchema = z.object({
  results: z
    .object({
      rule: z.string(),
      classification: z.string(),
      justification: z.string()
    })
    .array()
});

export const automatedSecurityServiceFactory = ({
  auditLogDAL,
  automatedSecurityReportDAL,
  identityProfileDAL,
  permissionService,
  queueService,
  orgDAL
}: TAutomatedSecurityServiceFactoryDep) => {
  const getReports = async (orgId: string) => {
    const automatedReports = await automatedSecurityReportDAL.findByOrg(orgId, "pending");

    return automatedReports;
  };

  const patchSecurityReportStatus = async (id: string, status: "resolved" | "ignored") => {
    const appCfg = getConfig();

    const securityReport = await automatedSecurityReportDAL.findById(id);
    if (!securityReport) {
      throw new NotFoundError({
        message: "Cannot find security report"
      });
    }

    if (status === "ignored") {
      const openAiClient = new OpenAI({
        apiKey: appCfg.AI_API_KEY
      });

      const profileResponse = await openAiClient.beta.chat.completions.parse({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a security behavior analysis system that builds and maintains behavioral profiles.
                            Your task is to analyze security events and prior profile information to generate cumulative profiles.
                            Focus on three aspects:
                            1. Temporal patterns (WHEN/HOW OFTEN)
                            2. Scope patterns (WHAT/WHERE)
                            3. Usage patterns (HOW)
      
                            Build comprehensive profiles:
                            - Each profile should be 5-7 sentences to capture both established and emerging patterns
                            - Core patterns get 1-2 sentences
                            - Notable exceptions get 1-2 sentences
                            - Emerging behaviors get 1-2 sentences
                            - Key correlations get 1 sentence
                            
                            Build profiles incrementally:
                            - ALWAYS retain existing profile information unless directly contradicted
                            - Add ANY new observed patterns, even from limited samples
                            - Mark patterns as "emerging" if based on few observations
                            - Use qualifiers like "occasionally" or "sometimes" for sparse patterns
                            - Never dismiss patterns as insignificant due to sample size
                            - Maintain history of both frequent and rare behaviors
      
                            When updating profiles:
                            - Keep all historical patterns unless explicitly contradicted
                            - Add new patterns with appropriate frequency qualifiers
                            - Note both common and occasional behaviors
                            - Use tentative language for new patterns ("appears to", "beginning to")
                            - Highlight any changes or new observations
                                          
                            
                            Remember that dates being passed in are in ISO format`
          },
          {
            role: "user",
            content: `Current behavioral profiles:
                          ${JSON.stringify(
                            {
                              temporalProfile: securityReport.temporalProfile,
                              scopeProfile: securityReport.scopeProfile,
                              usageProfile: securityReport.usageProfile
                            },
                            null,
                            2
                          )}
                    
                          New security event to analyze:
                          ${JSON.stringify(securityReport.event)}
                    
                          Generate updated profiles that preserve ALL existing patterns and add new observations.
                          Use appropriate qualifiers for frequency but include all behaviors.
                          
                          Return exactly in this format:
                          temporalProfile: "..."
                          scopeProfile: "..."
                          usageProfile: "..."`
          }
        ],
        response_format: zodResponseFormat(ProfileIdentityResponseSchema, "profile_identity_response_schema")
      });

      const parsedResponse = profileResponse.choices[0].message.parsed;

      await identityProfileDAL.updateById(securityReport.profileId, {
        temporalProfile: parsedResponse?.temporalProfile ?? "",
        usageProfile: parsedResponse?.usageProfile ?? "",
        scopeProfile: parsedResponse?.scopeProfile ?? ""
      });
    }

    await automatedSecurityReportDAL.updateById(id, {
      status
    });
  };

  const processSecurityJob = async () => {
    const appCfg = getConfig();
    const orgs = await orgDAL.find({
      id: "1edc8c6e-8a39-499e-89a2-5d26149149cb"
    });

    await Promise.allSettled(
      orgs.map(async (org) => {
        const orgUsers = await orgDAL.findAllOrgMembers(org.id);

        const dateNow = new Date();
        const startDate = new Date(dateNow);

        startDate.setMinutes(dateNow.getMinutes() - 30);

        await Promise.all(
          orgUsers.map(async (orgUser) => {
            try {
              const openAiClient = new OpenAI({
                apiKey: appCfg.AI_API_KEY
              });

              const auditLogEvents = await auditLogDAL.find({
                actorId: orgUser.user.id,
                orgId: org.id,
                startDate: startDate.toISOString(),
                limit: 100
              });

              if (!auditLogEvents.length) {
                return;
              }

              let normalEvents: TAuditLogs[] = auditLogEvents;

              const identityProfile = await identityProfileDAL.transaction(async (tx) => {
                const profile = await identityProfileDAL.findOne(
                  {
                    userId: orgUser.user.id
                  },
                  tx
                );

                if (!profile) {
                  return identityProfileDAL.create(
                    {
                      userId: orgUser.user.id,
                      temporalProfile: "",
                      usageProfile: "",
                      scopeProfile: "",
                      orgId: org.id
                    },
                    tx
                  );
                }

                return profile;
              });

              if (identityProfile.usageProfile && identityProfile.scopeProfile && identityProfile.temporalProfile) {
                logger.info("Checking for anomalies...");
                const anomalyResponse = await openAiClient.beta.chat.completions.parse({
                  model: "gpt-4o",
                  messages: [
                    {
                      role: "system",
                      content: `
                        You are a security analysis system that uses behavioral profiles to identify potentially suspicious activity for an identity.
                
                        Understanding Identity Profiles:
                        - Temporal Profile: When and how frequently the identity normally operates
                        - Scope Profile: What resources and permissions the identity typically uses
                        - Usage Profile: How the identity normally interacts with systems
                
                        Security Analysis Rules:
                        HIGH Severity - Clear security concerns:
                        - Actions well outside the identity's normal scope of access
                        - Resource access patterns suggesting compromise
                        - Violation of critical security boundaries
                        
                        MEDIUM Severity - Requires investigation:
                        - Significant expansion of identity's normal access patterns
                        - Unusual combination of valid permissions
                        - Behavior suggesting possible credential misuse
                        
                        NONE Severity (Default) - Expected behavior:
                        - Actions within established identity patterns
                        - Minor variations in normal behavior
                        - Business-justified changes in access patterns
                        - New but authorized behavior extensions
                
                        Note: LOW severity should not be used - an action either 
                        indicates a security concern (HIGH/MEDIUM) or it doesn't (NONE).
                
                        Analysis Process:
                        1. Compare event against identity's established profiles
                        2. Evaluate if deviations suggest potential security risks
                        3. Consider business context and authorization
                        4. Mark as anomalous ONLY if the deviation suggests security risk`
                    },
                    {
                      role: "user",
                      content: `Given these established behavioral profiles for an identity:
                
                temporalProfile: "${identityProfile.temporalProfile}"
                scopeProfile: "${identityProfile.scopeProfile}"
                usageProfile: "${identityProfile.usageProfile}"
                
                Analyze these events for anomalies:
                ${JSON.stringify(auditLogEvents, null, 2)}
                      
                Return response in this exact JSON format:
                { results: [
                    {
                      "auditLogId": "event-123",
                      "isAnomalous": false,
                      "reason": "",
                      "severity": "NONE"
                    },
                    {
                      "auditLogId": "event-124",
                      "isAnomalous": true,
                      "reason": "Accessing production secrets outside business hours",
                      "severity": "HIGH"
                    }
                  ]}
                  `
                    }
                  ],
                  response_format: zodResponseFormat(AnomalyResponseSchema, "anomaly_response_schema")
                });

                const parsedAnomalyResponse = anomalyResponse.choices[0].message.parsed;
                const anomalyEvents = parsedAnomalyResponse?.results?.filter((val) => val.isAnomalous);
                console.log("ANOMALY EVENTS:", anomalyEvents);

                const anomalyEventMap = anomalyEvents?.reduce((accum, item) => {
                  return { ...accum, [item.auditLogId]: item };
                }, {}) as {
                  [x: string]: {
                    reason: string;
                    severity: string;
                  };
                };

                const anomalousEventIds = anomalyEvents?.map((evt) => evt.auditLogId);
                normalEvents = auditLogEvents.filter((evt) => !anomalousEventIds?.includes(evt.id));

                await Promise.all(
                  (auditLogEvents ?? [])?.map(async (evt) => {
                    const anomalyDetails = anomalyEventMap[evt.id];
                    if (!anomalyDetails) {
                      return;
                    }

                    await automatedSecurityReportDAL.create({
                      status: "pending",
                      profileId: identityProfile.id,
                      remarks: anomalyDetails.reason,
                      severity: anomalyDetails.severity,
                      event: JSON.stringify(evt, null, 2)
                    });
                  })
                );
              }

              console.log("Calibrating identity profile");
              // profile identity
              const profileResponse = await openAiClient.beta.chat.completions.parse({
                model: "gpt-4o",
                messages: [
                  {
                    role: "system",
                    content: `You are a security behavior analysis system that builds and maintains behavioral profiles.
                      Your task is to analyze security events and prior profile information to generate cumulative profiles.
                      Focus on three aspects:
                      1. Temporal patterns (WHEN/HOW OFTEN)
                      2. Scope patterns (WHAT/WHERE)
                      3. Usage patterns (HOW)

                      Build comprehensive profiles:
                      - Each profile should be 5-7 sentences to capture both established and emerging patterns
                      - Core patterns get 1-2 sentences
                      - Notable exceptions get 1-2 sentences
                      - Emerging behaviors get 1-2 sentences
                      - Key correlations get 1 sentence
                      
                      Build profiles incrementally:
                      - ALWAYS retain existing profile information unless directly contradicted
                      - Add ANY new observed patterns, even from limited samples
                      - Mark patterns as "emerging" if based on few observations
                      - Use qualifiers like "occasionally" or "sometimes" for sparse patterns
                      - Never dismiss patterns as insignificant due to sample size
                      - Maintain history of both frequent and rare behaviors

                      When updating profiles:
                      - Keep all historical patterns unless explicitly contradicted
                      - Add new patterns with appropriate frequency qualifiers
                      - Note both common and occasional behaviors
                      - Use tentative language for new patterns ("appears to", "beginning to")
                      - Highlight any changes or new observations
                                    
                      
                      Remember that dates being passed in are in ISO format`
                  },
                  {
                    role: "user",
                    content: `Current behavioral profiles:
                    ${JSON.stringify(
                      {
                        temporalProfile: identityProfile.temporalProfile,
                        scopeProfile: identityProfile.scopeProfile,
                        usageProfile: identityProfile.usageProfile
                      },
                      null,
                      2
                    )}
              
                    New security events to analyze:
                    ${JSON.stringify(normalEvents, null, 2)}
              
                    Generate updated profiles that preserve ALL existing patterns and add new observations.
                    Use appropriate qualifiers for frequency but include all behaviors.
                    
                    Return exactly in this format:
                    temporalProfile: "..."
                    scopeProfile: "..."
                    usageProfile: "..."`
                  }
                ],
                response_format: zodResponseFormat(ProfileIdentityResponseSchema, "profile_identity_response_schema")
              });

              const parsedResponse = profileResponse.choices[0].message.parsed;

              await identityProfileDAL.updateById(identityProfile.id, {
                temporalProfile: parsedResponse?.temporalProfile ?? "",
                usageProfile: parsedResponse?.usageProfile ?? "",
                scopeProfile: parsedResponse?.scopeProfile ?? ""
              });

              console.log("FINISH");
            } catch (err) {
              logger.error(err);

              throw err;
            }
          })
        );
      })
    );
  };

  const analyzeIdentityProjectPermission = async (userId: string, projectId: string) => {
    const appCfg = getConfig();
    const userProjectPermission = await permissionService.getUserProjectPermission({
      userId,
      projectId,
      authMethod: AuthMethod.EMAIL,
      actionProjectType: ActionProjectType.Any,
      userOrgId: "1edc8c6e-8a39-499e-89a2-5d26149149cb"
    });

    const identityProfile = await identityProfileDAL.findOne({
      userId
    });

    const openAiClient = new OpenAI({
      apiKey: appCfg.AI_API_KEY
    });

    const caslRuleAnalysisResponse = await openAiClient.beta.chat.completions.parse({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a security analysis system that evaluates CASL permission rules against behavioral profiles.
        
        Your task is to identify CASL rules that appear unnecessary based on the identity's observed behavior.
        
        Analysis process:
        1. Review the identity's behavioral profiles (temporal, scope, usage)
        2. Examine current CASL permission rules
        3. Identify rules that grant permissions never or rarely used based on the profiles
        4. Consider business context and security implications before marking rules as unnecessary
        
        Classification criteria:
        - UNNECESSARY: Rule grants permissions never observed in the behavior profile
        - OVERPROVISIONED: Rule grants broader access than typically used
        - QUESTIONABLE: Rule grants permissions used very rarely (<5% of activity)
        
        Provide justification for each classification based on specific patterns in the profiles.
        Consider both explicit patterns (directly mentioned) and implicit patterns (strongly implied).
        
        Remember that security is the priority - when in doubt, mark a rule as QUESTIONABLE rather than UNNECESSARY.`
        },
        {
          role: "user",
          content: `Identity Behavioral Profiles:
      ${JSON.stringify(
        {
          temporalProfile: identityProfile.temporalProfile,
          scopeProfile: identityProfile.scopeProfile,
          usageProfile: identityProfile.usageProfile
        },
        null,
        2
      )}
      
      Current CASL Permission Rules:
      ${JSON.stringify(userProjectPermission.permission.rules, null, 2)}
      
      Analyze these rules against the behavioral profiles and identify which rules appear unnecessary.
      
      Return in this exact format:
      {
        "results": [
          {
            "rule": "create secret",
            "classification": "UNNECESSARY",
            "justification": "No evidence in profile of needing this resource",
          },
          {
            "rule": "delete secret",
            "classification": "NECESSARY",
            "justification": "Regular access pattern in usage profile",
          }
        ]
      }`
        }
      ],
      response_format: zodResponseFormat(CaslRuleAnalysisSchema, "casl_rule_analysis_schema")
    });

    return caslRuleAnalysisResponse.choices[0].message.parsed;
  };

  const startJob = async () => {
    await queueService.stopRepeatableJob(
      QueueName.AutomatedSecurity,
      QueueJobs.ProfileIdentity,
      { pattern: "0 0 * * *", utc: true },
      QueueName.AutomatedSecurity // just a job id
    );

    await queueService.queue(QueueName.AutomatedSecurity, QueueJobs.ProfileIdentity, undefined, {
      delay: 5000,
      jobId: QueueName.AutomatedSecurity,
      repeat: { pattern: "0 0 * * *", utc: true }
    });
  };

  queueService.start(QueueName.AutomatedSecurity, async (job) => {
    if (job.name === QueueJobs.ProfileIdentity) {
      await processSecurityJob();
    }
  });

  queueService.listen(QueueName.AutomatedSecurity, "failed", (job, err) => {
    logger.error(err, "Failed to process job", job?.data);
  });

  return {
    processSecurityJob,
    patchSecurityReportStatus,
    analyzeIdentityProjectPermission,
    startJob,
    getReports
  };
};
