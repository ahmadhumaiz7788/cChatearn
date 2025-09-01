import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, RotateCcw, Check, Clock, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  responseTime?: number;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

export const ChatMessage = ({
  role,
  content,
  tokens,
  responseTime,
  onRegenerate,
  isGenerating = false,
}: ChatMessageProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast({
      title: 'Copied to clipboard',
      description: 'Message content copied successfully',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`flex gap-4 mb-6 ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {role === 'assistant' && (
        <Avatar className="h-8 w-8 mt-1">
          <AvatarFallback className="bg-gradient-primary text-primary-foreground">
            AI
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`max-w-[80%] ${role === 'user' ? 'order-first' : ''}`}>
        <Card
          className={`p-4 relative ${
            role === 'user'
              ? 'message-user ml-auto'
              : 'message-ai glass-strong'
          } ${isGenerating ? 'typing-indicator' : ''}`}
        >
          {/* Message content */}
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="whitespace-pre-wrap m-0">{content}</p>
          </div>

          {/* AI message metadata */}
          {role === 'assistant' && !isGenerating && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
              <div className="flex items-center gap-2">
                {tokens && (
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    {tokens} tokens
                  </Badge>
                )}
                {responseTime && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatResponseTime(responseTime)}
                  </Badge>
                )}
              </div>

              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="h-8 w-8 p-0"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                {onRegenerate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onRegenerate}
                    className="h-8 w-8 p-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {role === 'user' && (
        <Avatar className="h-8 w-8 mt-1">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            U
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};