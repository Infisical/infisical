export type Metadata = {
    secretPrefix?: string;
    secretSuffix?: string;
    secretGCPLabel?: {
        labelName: string;
        labelValue: string;
    }
    secretAWSTag?: {
        key: string;
        value: string;
    }[]
    kmsKeyId?: string;
    shouldDisableDelete?: boolean;
}