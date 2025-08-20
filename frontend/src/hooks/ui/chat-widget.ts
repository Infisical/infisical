import { useQuery, useQueryClient } from "@tanstack/react-query";

export type TChatWidgetState = {
  isOpen: boolean;
  documentationUrl?: string;
  documentationContent?: string;
};

export const chatWidgetQueryKeys = {
  state: () => ["ui", "chatWidget", "state"] as const,
  content: (url: string) => ["ui", "chatWidget", "content", url] as const
};

const getDefaultChatWidgetState = (): TChatWidgetState => ({
  isOpen: false,
  documentationUrl: undefined,
  documentationContent: undefined
});

/**
 * Hook to read the current chat widget state (open/closed, current URL)
 */
export const useChatWidgetState = () => {
  return useQuery<TChatWidgetState>({
    queryKey: chatWidgetQueryKeys.state(),
    queryFn: getDefaultChatWidgetState,
    staleTime: Infinity,
    gcTime: Infinity
  });
};

/**
 * Hook to read cached documentation content for a specific URL
 * @param url - The documentation URL to get content for
 */
export const useChatWidgetContent = (url?: string) => {
  return useQuery({
    queryKey: chatWidgetQueryKeys.content(url || ""),
    queryFn: () => null, // This will be set via setQueryData
    enabled: Boolean(url),
    staleTime: Infinity,
    gcTime: Infinity
  });
};

export const useChatWidgetActions = () => {
  const queryClient = useQueryClient();

  const setDocumentationUrl = (url?: string) => {
    queryClient.setQueryData<TChatWidgetState>(chatWidgetQueryKeys.state(), (prev) => ({
      ...(prev ?? getDefaultChatWidgetState()),
      documentationUrl: url
    }));
  };

  const setDocumentationContent = (url: string, content: string) => {
    queryClient.setQueryData(chatWidgetQueryKeys.content(url), content);
  };

  const setOpen = (isOpen: boolean) => {
    queryClient.setQueryData<TChatWidgetState>(chatWidgetQueryKeys.state(), (prev) => ({
      ...(prev ?? getDefaultChatWidgetState()),
      isOpen
    }));
  };

  const toggle = () => {
    const prev =
      queryClient.getQueryData<TChatWidgetState>(chatWidgetQueryKeys.state()) ??
      getDefaultChatWidgetState();

    setOpen(!prev.isOpen);
  };

  const openWithUrl = (url: string) => {
    queryClient.setQueryData<TChatWidgetState>(chatWidgetQueryKeys.state(), (prev) => ({
      ...(prev ?? getDefaultChatWidgetState()),
      isOpen: true,
      documentationUrl: url
    }));
  };

  return {
    setOpen,
    toggle,
    setDocumentationUrl,
    setDocumentationContent,
    openWithUrl
  };
};
