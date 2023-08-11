import { Types } from "mongoose";
import { AuditLog, Event } from "../models";
import { AuthData } from "../../interfaces/middleware";
import EELicenseService from "./EELicenseService";
import { Workspace } from "../../models";
import { OrganizationNotFoundError } from "../../utils/errors";

interface EventScope {
    workspaceId?: Types.ObjectId;
    organizationId?: Types.ObjectId;
}

type ValidEventScope = 
    | Required<Pick<EventScope, "workspaceId">>
    | Required<Pick<EventScope, "organizationId">>
    | Required<EventScope>

export default class EEAuditLogService {
    static async createAuditLog(authData: AuthData, event: Event, eventScope: ValidEventScope, shouldSave = true) {
        
        const MS_IN_DAY = 24 * 60 * 60 * 1000;
        
        const organizationId = ("organizationId" in eventScope)
            ? eventScope.organizationId
            : (await Workspace.findById(eventScope.workspaceId).select("organization").lean())?.organization;
        
        if (!organizationId) throw OrganizationNotFoundError({
            message: "createAuditLog: Failed to create audit log due to missing organizationId"
        });

        const ttl = (await EELicenseService.getPlan(organizationId)).auditLogsRetentionDays * MS_IN_DAY;
        
        const auditLog = await new AuditLog({
            actor: authData.actor,
            organization: organizationId,
            workspace: ("workspaceId" in eventScope) ? eventScope.workspaceId : undefined,
            ipAddress: authData.ipAddress,
            event,
            userAgent: authData.userAgent,
            userAgentType: authData.userAgentType,
            expiresAt: new Date(Date.now() + ttl)
        });
        
        if (shouldSave) {
            await auditLog.save();
        }
        
        return auditLog;
    }
}