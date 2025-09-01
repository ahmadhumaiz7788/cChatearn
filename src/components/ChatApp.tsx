import { useState, useCallback } from 'react';
import { ConversationSidebar } from './chat/ConversationSidebar';
import { ChatInterface } from './chat/ChatInterface';

export const ChatApp = () => {
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [sidebarKey, setSidebarKey] = useState(0); // Force sidebar refresh

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(undefined);
  }, []);

  const handleConversationUpdate = useCallback(() => {
    // Force sidebar to refresh by changing key
    setSidebarKey(prev => prev + 1);
  }, []);

  return (
    <div className="h-screen flex bg-background">
      <ConversationSidebar
        key={sidebarKey}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      <div className="flex-1 flex flex-col">
        <ChatInterface
          conversationId={activeConversationId}
          onConversationUpdate={handleConversationUpdate}
        />
      </div>
    </div>
  );
};