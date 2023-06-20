import { apiRequest } from "@app/config/request";

interface RequestType {
    method: string;
    secret: {
        type: string;
        secretKeyCiphertext: string;
        secretKeyIV: string;
        secretKeyTag: string;
        secretValueCiphertext: string;
        secretValueIV: string;
        secretValueTag: string;
        secretCommentCiphertext: string;
        secretCommentIV: string;
        secretCommentTag: string;
        tags: string[];
    }
}

const batchSecrets = async ({
    workspaceId,
    environment,
    requests
}: {
    workspaceId: string;
    environment: string;
    requests: RequestType[];
}) => {
    const { data } = await apiRequest.post("/api/v2/secrets/batch", {
        workspaceId,
        environment,
        requests
    });
    
    return data;
}

export default batchSecrets;