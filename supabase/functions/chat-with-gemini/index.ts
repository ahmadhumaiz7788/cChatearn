import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  stylePackId?: string;
  isBoost?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Chat request received');
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing');
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header found');
      throw new Error('No authorization header');
    }
    
    console.log('Authorization header present:', authHeader.substring(0, 20) + '...');

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('User error:', userError);
      throw new Error(`Authentication failed: ${userError.message}`);
    }
    if (!user) {
      console.error('No user found');
      throw new Error('Authentication failed: No user found');
    }
    
    console.log('User authenticated:', user.id);

    const { message, conversationId, stylePackId, isBoost } = await req.json() as ChatRequest;
    console.log('Processing message for user:', user.id);

    const startTime = Date.now();

    // Get or create conversation
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        throw new Error('Failed to create conversation');
      }

      currentConversationId = newConversation.id;
    }

    // Get conversation history (last 10 messages for context)
    const { data: messageHistory, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', currentConversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    if (historyError) {
      console.error('Error fetching message history:', historyError);
      throw new Error('Failed to fetch conversation history');
    }

    // Get style pack if specified
    let systemPrompt = 'You are a helpful AI assistant.';
    if (stylePackId) {
      const { data: stylePack } = await supabase
        .from('style_packs')
        .select('system_prompt')
        .eq('id', stylePackId)
        .single();
      
      if (stylePack) {
        systemPrompt = stylePack.system_prompt;
      }
    }

    // Build messages array for Gemini
    const messages = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'I understand. I will respond according to this personality and style.' }] },
    ];

    // Add conversation history
    messageHistory?.forEach((msg) => {
      if (msg.role === 'user') {
        messages.push({ role: 'user', parts: [{ text: msg.content }] });
      } else {
        messages.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    });

    // Add current message
    messages.push({ role: 'user', parts: [{ text: message }] });

    console.log('Calling Gemini API with', messages.length, 'messages');

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: messages,
          generationConfig: {
            temperature: 0.9,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            }
          ]
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error status:', geminiResponse.status);
      console.error('Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini API response received');

    if (!geminiData.candidates || !geminiData.candidates[0]?.content?.parts?.[0]?.text) {
      console.error('Invalid Gemini response:', geminiData);
      throw new Error('Invalid response from Gemini API');
    }

    const aiResponse = geminiData.candidates[0].content.parts[0].text;
    const responseTime = Date.now() - startTime;
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount || 0;

    // Check for harmful content (simple filter)
    const isHarmful = /\b(violence|hate|illegal|harmful)\b/i.test(message.toLowerCase());

    // Save user message
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: message,
      });

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
    }

    // Save AI response
    const { error: aiMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'assistant',
        content: aiResponse,
        tokens_used: tokensUsed,
        response_time_ms: responseTime,
      });

    if (aiMsgError) {
      console.error('Error saving AI message:', aiMsgError);
    }

    // Award points if not harmful content
    if (!isHarmful) {
      // Background task for points and streak calculation
      EdgeRuntime.waitUntil(
        (async () => {
          try {
            // Get user profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', user.id)
              .single();

            if (profile) {
              const today = new Date().toISOString().split('T')[0];
              const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
              
              let pointsToAdd = 1; // Base message reward
              let newStreak = profile.current_streak;

              // Check if it's a new day and calculate streak
              if (profile.last_activity_date !== today) {
                if (profile.last_activity_date === yesterday) {
                  newStreak += 1;
                  pointsToAdd += 5; // Streak bonus
                } else {
                  newStreak = 1; // Reset streak
                }
              }

              // Deduct points for boost if used
              if (isBoost && profile.total_points >= 10) {
                pointsToAdd -= 10;
              }

              // Update profile
              await supabase
                .from('profiles')
                .update({
                  total_points: profile.total_points + pointsToAdd,
                  current_streak: newStreak,
                  last_activity_date: today,
                })
                .eq('user_id', user.id);

              // Record reward transaction
              if (pointsToAdd !== 0) {
                await supabase
                  .from('rewards')
                  .insert({
                    user_id: user.id,
                    type: pointsToAdd > 1 ? 'streak' : pointsToAdd > 0 ? 'message' : 'boost',
                    points: pointsToAdd,
                    description: pointsToAdd > 1 
                      ? `Daily streak: ${newStreak} days` 
                      : pointsToAdd > 0 
                        ? 'Message sent' 
                        : 'Boost used',
                  });
              }
            }
          } catch (error) {
            console.error('Error processing rewards:', error);
          }
        })()
      );
    }

    return new Response(
      JSON.stringify({
        response: aiResponse,
        conversationId: currentConversationId,
        tokensUsed,
        responseTime,
        pointsAwarded: !isHarmful,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});