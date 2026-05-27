import { test, expect } from './fixtures';

test('Extension identifies local AI availability correctly', async ({ page, context }) => {
    // Find the extension ID from the service worker
    let [background] = context.serviceWorkers();
    if (!background) {
        try {
            background = await context.waitForEvent('serviceworker', { timeout: 5000 });
        } catch {
            const workers = context.serviceWorkers();
            if (workers.length > 0) background = workers[0];
        }
    }
    const extensionId = background ? background.url().split('/')[2] : '';
    if (!extensionId) throw new Error('Extension ID not found');

    // Mock the window.LanguageModel API (Gemini Nano)
    await context.addInitScript(() => {
        (window as any).LanguageModel = {
            availability: async () => 'available',
            create: async () => ({
                prompt: async (promptText: string) => {
                    if (promptText.includes('Suggest tags')) return '["important", "review"]';
                    return "Mocked AI Response";
                },
                destroy: () => { }
            })
        };
    });

    await page.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);

    // Wait for scripts to load and assign functions to globalThis
    await page.waitForFunction(() => typeof (window as any).localAiAvailability === 'function');

    const availability = await page.evaluate(async () => {
        // @ts-ignore
        return await localAiAvailability();
    });

    expect(availability).toBe('available');
});

test('localSuggestTags correctly parses tags from AI response', async ({ page, context }) => {
    let [background] = context.serviceWorkers();
    if (!background) {
        try {
            background = await context.waitForEvent('serviceworker', { timeout: 5000 });
        } catch {
            const workers = context.serviceWorkers();
            if (workers.length > 0) background = workers[0];
        }
    }
    const extensionId = background ? background.url().split('/')[2] : '';
    if (!extensionId) throw new Error('Extension ID not found');

    await context.addInitScript(() => {
        (window as any).LanguageModel = {
            availability: async () => 'available',
            create: async () => ({
                prompt: async () => '["important", "review"]',
                destroy: () => { }
            })
        };
    });

    await page.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
    await page.waitForFunction(() => typeof (window as any).localSuggestTags === 'function');

    const tags = await page.evaluate(async () => {
        // @ts-ignore
        return await localSuggestTags("A tutorial", "Transcript...");
    });

    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('important');
});

