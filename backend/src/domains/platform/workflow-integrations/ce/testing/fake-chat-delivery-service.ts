import { TChatDeliveryService, TChatPostResult, TPostChatMessageInput } from "../services/chat-delivery/service";
import { TChatPostRefusal } from "../services/dependencies";

// For products that post through Workflow Integrations: records each post and answers like the real service, every
// channel delivered unless the test refused it or named the integration missing.
export class FakeChatDeliveryService implements TChatDeliveryService {
  readonly posts: TPostChatMessageInput[] = [];

  private readonly refusals = new Map<string, TChatPostRefusal>();

  private readonly missing = new Set<string>();

  refuse = (channelId: string, refusal: TChatPostRefusal) => {
    this.refusals.set(channelId, refusal);
    return this;
  };

  markMissing = (integrationId: string) => {
    this.missing.add(integrationId);
    return this;
  };

  post = async (input: TPostChatMessageInput): Promise<TChatPostResult> => {
    if (this.missing.has(input.integrationId)) return { integrationMissing: true };
    this.posts.push(input);
    return {
      integrationMissing: false,
      channels: input.channelIds.map((channelId) => {
        const refusal = this.refusals.get(channelId);
        return refusal ? { channelId, delivered: false as const, ...refusal } : { channelId, delivered: true as const };
      })
    };
  };
}
