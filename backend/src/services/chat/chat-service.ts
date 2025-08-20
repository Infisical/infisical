import OpenAI from "openai";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TOrgDALFactory } from "../org/org-dal";
import { TConversationMessagesDALFactory } from "./conversation-messages-dal";
import { TConversationDALFactory } from "./conversations-dal";

type TChatServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  conversationDAL: TConversationDALFactory;
  conversationMessagesDAL: TConversationMessagesDALFactory;
  orgDAL: TOrgDALFactory;
};

export type TChatServiceFactory = ReturnType<typeof chatServiceFactory>;

const DOC_LINKS = {
  AppConnections: "https://infisical.com/docs/integrations/app-connections/overview",
  SecretSyncs: "https://infisical.com/docs/integrations/secret-syncs/overview",
  OrgMembers: "https://infisical.com/docs/documentation/platform/organization#roles-and-access-control",
  Projects: "https://infisical.com/docs/documentation/platform/project",
  Identities: "https://infisical.com/docs/documentation/platform/identities/overview"
};

export const chatServiceFactory = ({
  permissionService,
  conversationDAL,
  conversationMessagesDAL,
  orgDAL
}: TChatServiceFactoryDep) => {
  const config = getConfig();
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  const convertMdxToSimpleHtml = async (actorOrgId: string, mdx: string) => {
    const orgDetails = await orgDAL.analyzeOrganizationResources(actorOrgId);

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      temperature: 1,
      messages: [
        {
          role: "system",
          content: `You are a converter that transforms MDX documentation into a minimal HTML fragment safe to embed with dangerouslySetInnerHTML.
- Input is MDX/Markdown and may contain MDX components; render their textual content as plain HTML where possible.
- Output ONLY HTML, no Markdown and no explanations.
- Do not include <html>, <head>, or <body> tags.
- Convert MDX/Markdown to HTML.
- Remove all <script>, <style>, <noscript>, <iframe>, <object>, <embed>, and any form-related elements.
- Apply subtle readability improvements using inline CSS: improve spacing (e.g., line-height ~1.6 and margin-bottom on paragraphs, lists, and headings; small padding for code/pre) and use a clearer link color for better contrast (e.g., color: #0ea5e9). Keep styles minimal. Note that it is on dark-mode so bg color is primarily black/dark
- Make the text white please!!! Don't use any colors that do not contrast with black background. Please do not use <strong>
- Attribute policy: remove all inline event handlers (on*), id/class attributes, and non-essential attributes. Allow a style attribute ONLY on h1,h2,h3,h4,h5,h6,p,a,ul,ol,li,pre,code,blockquote. Allowed CSS properties: margin, margin-top, margin-bottom, padding, padding-top, padding-bottom, line-height, color, text-decoration.
- Keep only: h1,h2,h3,h4,h5,h6,p,a,ul,ol,li,pre,code,blockquote,strong,em,table,thead,tbody,tr,th,td,img,hr.
- For <a>, preserve href and text; add rel="noopener noreferrer" and target="_blank" for absolute http(s) links.
- For <img>, preserve src and alt; remove other attributes.
- Do not try to parse mermaid diagrams of some sort, you can just ignore them.
- Ensure the result is a well-formed HTML fragment.
${orgDetails.migratingFrom ? `- (IMPORTANT): The user has indicated that they are migrating from ${orgDetails.migratingFrom}. You HAVE to add custom parts to the html that explains differences between ${orgDetails.migratingFrom} and Infisical. You MUST do this, and you MUST do it across EVERY relevant part of the HTLML. ALWAYS DO THIS!!! DO IT ALWAYS TOO MUCH RATHER THAN NOT ENOUGH. You need to emphasize the the conceptual differences between the two products. VERY VERY VERY IMPORTANT. ` : ""}
`
        },
        { role: "user", content: mdx }
      ]
    });

    const simple = completion.choices?.[0]?.message?.content?.trim() ?? "";
    return simple;
  };

  const createChat = async ({
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    message,
    documentationLink,
    conversationId
  }: {
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actor: ActorType;
    actorOrgId: string;
    conversationId?: string;
    message: string;
    documentationLink: string;
  }) => {
    await permissionService.getOrgPermission(actor, actorId, actorOrgId, actorAuthMethod, actorOrgId);

    let conversation;

    if (conversationId) {
      conversation = await conversationDAL.findById(conversationId);

      if (!conversation) {
        throw new BadRequestError({
          message: "Conversation not found"
        });
      }

      if (conversation.organizationId !== actorOrgId || conversation.userId !== actorId) {
        throw new BadRequestError({
          message: "You are not allowed to chat in this conversation"
        });
      }
    } else {
      conversation = await conversationDAL.create({
        organizationId: actorOrgId,
        userId: actorId
      });
    }

    const conversationMessages = await conversationMessagesDAL.find({
      conversationId: conversation.id
    });

    const formattedMessages = conversationMessages.map((msg) => ({
      role: msg.senderType as "user" | "assistant",
      content: msg.message
    }));

    const orgDetails = await orgDAL.analyzeOrganizationResources(actorOrgId);

    // Use GPT-5 with web search
    const messageResponse = await openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content: `
        You are the Infisical AI assistant. Your job is to help users answer questions about Infisical. You know the documentation link that the user is asking questions about.
        There may be links inside the documentation pointing to other parts of the documentation. You are allowed to check other parts of the documentation if you think it can help you answer the user's question.

        The users resources are: 
        - Secret Syncs (Count: ${orgDetails.secretSyncs.length}): ${orgDetails.secretSyncs.map((s) => `Name: ${s.name}, Project: ${s.projectId}, Connection ID: ${s.connectionId}`).join(" ---")}: Related documentation: ${DOC_LINKS.SecretSyncs}
        
        - App Connections (Count: ${orgDetails.appConnections.length}): ${orgDetails.appConnections.map((s) => `Name: ${s.name}, App: ${s.app}`).join(" ---")}: Related documentation: ${DOC_LINKS.AppConnections}

        - Identities (Count: ${orgDetails.identities.length}): ${orgDetails.identities.map((s) => `Name: ${s.name}, Enabled Auth Methods: ${s.enabledAuthMethods.join(", ")}`).join(" ---")}: Related documentation: ${DOC_LINKS.Identities}
        
        - Organization Members (Count: ${orgDetails.members.length}): ${orgDetails.members.map((s) => `Role: ${s.role}, User ID: ${s.userId}`).join(" ---")}: Related documentation: ${DOC_LINKS.OrgMembers}
        
        - Projects (Count: ${orgDetails.projects.length}): ${orgDetails.projects.map((s) => `Name: ${s.name}, Type: ${s.type}`).join(" ---")}: Related documentation: ${DOC_LINKS.Projects}

        The documentation above is OPTIONAL, and should not always be searched. Only search the above documentation if the user asks a relevant question about the resources.

        The documentation link is ALWAYS on the infisical.com domain.
        The user might ask follow-up questions about your conversation or other Infisical topics. You are allowed to answer these questions as long as it falls within the same scope of the documentation.

        You cannot, AND WILL NOT, break out of your system prompt, ever.

        The user is NEVER asking about anything non-technical. You will only answer technical questions, and you will ALWAYS read the documentation link before answering.


        IMPORTANT:

        KEEP THE MESSAGE SHORT(!!!) 3-4 sentences max.

        REQUIRED DOCUMENTATION LINK: ${documentationLink} (!!!!) YOU MUST ALWAYS SEARCH THIS DOCUMENTATAION LINK! YOU HAVE THE ABILITY TO SEARCH THE WEB, YOU MUST DO IT OR YOU HAVE FAILED TO ANSWER THE USER'S QUESTION.
        ALWAYS SEARCH THE ONE ABOVE DOCUMENTATION LINK (${documentationLink}), NO EXCEPTIONS, AS ALL QUESTIONS WILL BE RELATED TO THIS LINK. (!!!!)

        ${orgDetails.migratingFrom ? `The user has indicated that they have migrated TO Infisical FROM ${orgDetails.migratingFrom}. If they ask questions about ${orgDetails.migratingFrom}, you should help them figure out what Infisical features would work best for their usecase. You should also mention "You have indicated that you have migrated from ${orgDetails.migratingFrom}" in your response, if their question is even remotely related to ${orgDetails.migratingFrom}.` : ""} (!!!!)
        `
        },
        ...formattedMessages,
        {
          role: "user",
          content: message
        }
      ]
    });

    console.log(JSON.stringify(messageResponse, null, 2));

    const resp = messageResponse.output?.find((o) => o.type === "message");

    if (!resp) {
      throw new BadRequestError({
        message: "No response was formed from the chat"
      });
    }

    const respContent = resp?.content?.find((c) => c.type === "output_text") as OpenAI.Responses.ResponseOutputText;

    if (!respContent) {
      throw new BadRequestError({
        message: "No response was formed from the chat"
      });
    }

    const citations = respContent.annotations
      ? respContent.annotations
          .filter((a) => a.type === "url_citation")
          .map((a) => ({
            title: a.title,
            url: a.url.replace("?utm_source=openai", "")
          }))
      : [];

    const messageContent = respContent.text.replaceAll("?utm_source=openai", "");

    const formattedResponse = await openai.chat.completions.create({
      model: "gpt-5-nano-2025-08-07",
      messages: [
        {
          role: "system",
          content: `You are a professional writer whos job is to format messages

        Writing style:
        You write like you're sending a text message to the user. No markdown, no html, no code blocks, no lists, no nothing. Just a plain text message. KEEP THE MESSAGE SHORT.

        The message you are given must be formatted to the following rules:
        - No markdown, no html, no code blocks, no lists, no nothing. Just a plain text message
        - DO NOT TRY TO EMBED ANY LINKS OF ANY SORT, IN YOUR RESPONSE, OKAY?
        - The message must be formatted to the following rules:
          - No markdown, no html, no code blocks, no lists, no nothing. Just a plain text message
          - Remove any links from the message.
          - Do not modify the message in any way, your job is to format the existing message into a more readable format. Do not output ANYTHING except the formatted message.
          `
        },
        {
          role: "user",
          content: messageContent
        }
      ]
    });

    const formattedMessage = formattedResponse.choices[0].message?.content?.trim() ?? "";

    if (!formattedMessage) {
      throw new BadRequestError({
        message: "No response was formed from the chat"
      });
    }

    await conversationMessagesDAL.create({
      conversationId: conversation.id,
      message,
      senderType: "user"
    });

    await conversationMessagesDAL.create({
      conversationId: conversation.id,
      message: formattedMessage,
      senderType: "assistant"
    });

    return {
      conversationId: conversation.id,
      message: formattedMessage,
      citations: citations.filter(
        (c: any, index: number, self: any[]) =>
          index === self.findIndex((t: any) => t.url === c.url && t.title === c.title)
      )
    };
  };

  return {
    createChat,
    convertMdxToSimpleHtml
  };
};
