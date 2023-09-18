
// TODO: in the future separate metadata 
// into distinct types by integration
export type Metadata = {
    secretPrefix?: string;
    secretSuffix?: string;
    secretGCPLabel?: {
        labelName: string;
        labelValue: string;
    }
    scope?: "Job" | "Application" | "Container";   
}