export type Metadata = {
    secretPrefix?: string;
    secretSuffix?: string;
    secretGCPLabel?: {
        labelName: string;
        labelValue: string;
    }
}