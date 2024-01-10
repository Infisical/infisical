import { Types } from "mongoose";
import { AuditLog, Event } from "../models";
import { AuthData } from "../../interfaces/middleware";
import EELicenseService from "./EELicenseService";
import { Workspace } from "../../models";

interface EventScope {
    workspaceId?: Types.ObjectId;
    organizationId?: Types.ObjectId;
}

type ValidEventScope = 
    | Required<Pick<EventScope, "workspaceId">>
    | Required<Pick<EventScope, "organizationId">>
    | Required<EventScope>
    | Record<string, never>;

export default class EEAuditLogService {
    static async createAuditLog(authData: AuthData, event: Event, eventScope: ValidEventScope = {}, shouldSave = true) {
        
        const MS_IN_DAY = 24 * 60 * 60 * 1000;
        
        let organizationId;
        if ("organizationId" in eventScope) {
            organizationId = eventScope.organizationId;
        } 
        
        let workspaceId;
        if ("workspaceId" in eventScope) {
            workspaceId = eventScope.workspaceId;
            
            if (!organizationId) {
                organizationId = (await Workspace.findById(workspaceId).select("organization").lean())?.organization;
            }
        }
        
        let expiresAt;
        if (organizationId) {
            const ttl = (await EELicenseService.getPlan(organizationId)).auditLogsRetentionDays * MS_IN_DAY;
            expiresAt = new Date(Date.now() + ttl);
        }
        
        const auditLog = await new AuditLog({
            actor: authData.actor,
            organization: organizationId,
            workspace: workspaceId,
            ipAddress: authData.ipAddress,
            event,
            userAgent: authData.userAgent,
            userAgentType: authData.userAgentType,
            expiresAt
        });
        
        if (shouldSave) {
            await auditLog.save();
        }
        
        return auditLog;
    }
}