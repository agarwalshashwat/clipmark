/**
 * AI Logic Tests
 * 
 * Verifies that the AI-driven features (local Gemini Nano integration)
 * work as expected with simulated data.
 */
import { test, expect } from './fixtures';
import { getExtensionId } from './helpers';

test.describe('AI Integration Logic', () => {

  test('localSuggestTags correctly parses JSON from Gemini Nano', async ({ context }) => {
    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/pages/popup.html`);

    // Mock the window.ai API which is unavailable in standard Chromium
    await popup.evaluate(() => {
      (window as any).ai = {
        languageModel: {
          capabilities: async () => ({ available: 'readily' }),
          memberOf: async () => ({ available: 'readily' }),
          create: async () => ({
            prompt: async (query: string) => {
              // Respond as a continuation of the "[" or "{" in the prompt
              if (query.endsWith('[')) {
                return '"coding", "typescript"]';
              }
              if (query.endsWith('{')) {
                return '"summary":"Test success","topics":["A"],"actionItems":["B"]}';
              }
              return '';
            },
            destroy: () => {}
          })
        }
      };
    });

    // Invoke the localSuggestTags helper via window
    const tags = await popup.evaluate(async () => {
      // Wait for it to be attached to window (ESM loading)
      for (let i = 0; i < 20; i++) {
        if ((window as any).localSuggestTags) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return await (window as any).localSuggestTags('This is a test transcript text about coding and typescript');
    });

    expect(tags).toEqual(['coding', 'typescript']);
  });

  test('localSummarizeBookmarks handles invalid JSON gracefully', async ({ context }) => {
    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/pages/popup.html`);

    // Mock the window.ai API to return garbage
    await popup.evaluate(() => {
      (window as any).ai = {
        languageModel: {
          capabilities: async () => ({ available: 'readily' }),
          create: async () => ({
            prompt: async () => "```invalid garbage```",
            destroy: () => {}
          })
        }
      };
    });

    // Invoke the localSummarizeBookmarks helper
    const summary = await popup.evaluate(async () => {
      // Wait for it to be attached to window (ESM loading)
      for (let i = 0; i < 20; i++) {
        if ((window as any).localSummarizeBookmarks) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return await (window as any).localSummarizeBookmarks([{ description: 'Test' } as any]);
    });

    // Should return fallback empty structure handle error without crashing
    expect(summary).toEqual({
      summary: '',
      topics: [],
      actionItems: []
    });
  });
});

