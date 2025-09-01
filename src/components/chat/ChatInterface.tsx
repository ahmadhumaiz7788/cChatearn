import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { ChatMessage } from './ChatMessage';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Send, Loader2, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens_used?: number;
  response_time_ms?: number;
  created_at: string;
}

interface ChatInterfaceProps {
  conversationId?: string;
  onConversationUpdate: () => void;
}

export const ChatInterface = ({ conversationId, onConversationUpdate }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (conversationId && conversationId !== currentConversationId) {
      setCurrentConversationId(conversationId);
      loadMessages(conversationId);
    }
  }, [conversationId, currentConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    
    if (data) {
      // Type assertion to ensure role is the correct union type
      const typedMessages = data.map(msg => ({
        ...msg,
        role: msg.role as 'user' | 'assistant'
      }));
      setMessages(typedMessages);
    }
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isGenerating || !session) return;

    const userMessage = input.trim();
    setInput('');
    setIsGenerating(true);

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await supabase.functions.invoke('chat-with-gemini', {
        body: {
          message: userMessage,
          conversationId: currentConversationId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to send message');
      }

      const { response: aiResponse, conversationId: newConvId, tokensUsed, responseTime } = response.data;

      // Update conversation ID if it's a new conversation
      if (newConvId && newConvId !== currentConversationId) {
        setCurrentConversationId(newConvId);
        onConversationUpdate();
      }

      // Reload messages to get the actual stored messages with IDs
      if (newConvId) {
        await loadMessages(newConvId);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
      
      // Remove the temporary user message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleRegenerate = async () => {
    if (!messages.length || isGenerating) return;

    // Find the last user message
    const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
    if (!lastUserMessage) return;

    // Remove the last AI response if it exists
    const filteredMessages = messages.filter((msg, index) => {
      const isLastAiMessage = msg.role === 'assistant' && 
        index === messages.length - 1 && 
        messages[index - 1]?.role === 'user';
      return !isLastAiMessage;
    });
    
    setMessages(filteredMessages);
    setInput(lastUserMessage.content);
    
    // Trigger regeneration
    setTimeout(() => {
      sendMessage();
    }, 100);
  };

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(undefined);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-glass-border glass">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">
            {currentConversationId ? 'FluxOracle Chat' : 'New Conversation'}
          </h1>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 && !isGenerating ? (
            <div className="text-center py-12">
              <Card className="glass-strong p-8 max-w-md mx-auto">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary glow-text" />
                <h3 className="text-xl font-semibold mb-2">Start a conversation</h3>
                <p className="text-muted-foreground">
                  Ask me anything! Each message earns you points, and daily streaks give bonus rewards.
                </p>
              </Card>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  tokens={message.tokens_used}
                  responseTime={message.response_time_ms}
                  onRegenerate={message.role === 'assistant' ? handleRegenerate : undefined}
                />
              ))}
              
              {isGenerating && (
                <ChatMessage
                  role="assistant"
                  content="Thinking..."
                  isGenerating={true}
                />
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-glass-border glass">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isGenerating}
              className="flex-1 bg-muted/50 border-border"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isGenerating}
              className="bg-gradient-primary hover:opacity-90 interactive"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send • Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
};