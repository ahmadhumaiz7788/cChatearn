import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { ChatMessage } from './ChatMessage';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Send, Loader2, Sparkles, Key } from 'lucide-react';

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
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(!geminiApiKey);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { session, user } = useAuth();

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
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error loading messages:', error);
        return;
      }
      
      if (data) {
        // Type assertion to ensure role is the correct union type
        const typedMessages = data.map(msg => ({
          ...msg,
          role: msg.role as 'user' | 'assistant'
        }));
        setMessages(typedMessages);
      }
    } catch (error) {
      console.error('Unexpected error loading messages:', error);
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
    if (!input.trim() || isGenerating || !session || !geminiApiKey) return;

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
      let activeConversationId = currentConversationId;

      // Create new conversation if needed
      if (!activeConversationId) {
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            title: userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : ''),
          })
          .select()
          .single();

        if (convError || !newConversation) {
          throw new Error('Failed to create conversation');
        }
        activeConversationId = newConversation.id;
        setCurrentConversationId(activeConversationId);
        onConversationUpdate();
      }

      // Get conversation history
      const { data: messageHistory = [] } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true })
        .limit(10);

      // Build Gemini messages
      const geminiMessages = [
        { role: 'user', parts: [{ text: 'You are a helpful AI assistant.' }] },
        { role: 'model', parts: [{ text: 'I understand. I will respond accordingly.' }] },
        ...messageHistory.map((m) =>
          m.role === 'user'
            ? { role: 'user', parts: [{ text: m.content }] }
            : { role: 'model', parts: [{ text: m.content }] }
        ),
        { role: 'user', parts: [{ text: userMessage }] },
      ];

      // Call Gemini API directly
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: geminiMessages }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      }

      const geminiData = await geminiResponse.json();
      const aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response';

      // Save both messages to database
      await supabase.from('messages').insert([
        { conversation_id: activeConversationId, role: 'user', content: userMessage },
        { conversation_id: activeConversationId, role: 'assistant', content: aiResponse }
      ]);

      // Reload messages to get the actual stored messages with IDs
      await loadMessages(activeConversationId);

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

  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', geminiApiKey);
    setShowApiKeyInput(false);
    toast({
      title: 'API Key Saved',
      description: 'Your Gemini API key has been saved locally.',
    });
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">
              {currentConversationId ? 'FluxOracle Chat' : 'New Conversation'}
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
          >
            <Key className="h-4 w-4" />
          </Button>
        </div>
        
        {showApiKeyInput && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Enter your Gemini API key..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="flex-1"
              />
              <Button onClick={saveApiKey} disabled={!geminiApiKey.trim()}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Your API key is stored locally in your browser. Get one from Google AI Studio.
            </p>
          </div>
        )}
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
              disabled={!input.trim() || isGenerating || !geminiApiKey}
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