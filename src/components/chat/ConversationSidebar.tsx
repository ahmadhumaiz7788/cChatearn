import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  MessageSquare, 
  Plus, 
  Trophy, 
  Zap, 
  Palette,
  LogOut,
  Sparkles,
  Flame
} from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface Profile {
  display_name: string;
  total_points: number;
  current_streak: number;
}

interface ConversationSidebarProps {
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationSidebar = ({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationSidebarProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      loadConversations();
      loadProfile();
    }
  }, [user]);

  const loadConversations = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (data) {
      setConversations(data);
    }
  };

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, total_points, current_streak')
      .eq('user_id', user?.id)
      .single();
    
    if (data) {
      setProfile(data);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-80 glass border-r border-glass-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-glass-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary glow-text" />
            <h2 className="font-bold text-lg">FluxOracle</h2>
          </div>
        </div>

        {/* User Profile */}
        {profile && (
          <Card className="glass-strong p-3 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile.display_name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.display_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Trophy className="h-3 w-3" />
                  <span>{profile.total_points} pts</span>
                  {profile.current_streak > 0 && (
                    <>
                      <Flame className="h-3 w-3 text-orange-500" />
                      <span>{profile.current_streak} day streak</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Boost (-10)
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Palette className="h-3 w-3 mr-1" />
                Style (-5)
              </Badge>
            </div>
          </Card>
        )}

        {/* New Chat Button */}
        <Button 
          onClick={onNewConversation}
          className="w-full bg-gradient-primary hover:opacity-90 interactive"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conversation) => (
            <Button
              key={conversation.id}
              variant={activeConversationId === conversation.id ? "secondary" : "ghost"}
              className={`w-full justify-start p-3 h-auto text-left interactive ${
                activeConversationId === conversation.id ? 'bg-secondary' : 'hover:bg-muted/50'
              }`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium truncate">{conversation.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(conversation.created_at)}
                </p>
              </div>
            </Button>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-glass-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};