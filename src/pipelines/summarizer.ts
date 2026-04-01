/**
 * AI Summarizer — summarizes transcribed content
 */
import OpenAI from 'openai';

const openai = new OpenAI();

export async function summarizeContent(transcript: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Summarize this video transcript into a concise, engaging social media post. Max 280 characters for Twitter, 3000 for LinkedIn.',
      },
      {
        role: 'user',
        content: transcript,
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || '';
}
