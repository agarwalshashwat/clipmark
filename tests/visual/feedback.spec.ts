/**
 * /feedback — rendered behaviour of the early-feedback form.
 *
 * Assertion-based rather than snapshot-based (the golden PNGs are gitignored and
 * regenerated per machine), and every POST is intercepted, so this never needs a
 * database or the `feedback` table from migration 017. What it checks is the part
 * static analysis cannot: that the star row actually lights up in the brand teal,
 * that a keyboard user can reach and see it, and that the three states —
 * validation error, server error, success — are the ones that render.
 */
import { test, expect, Page } from '@playwright/test';

const TEAL_700 = 'rgb(15, 118, 110)'; // --accent-strong: the selected star
const GRAY_400 = 'rgb(156, 163, 175)'; // --text-faint: an unselected star

const stars = (page: Page) => page.locator('.fb-star-glyph');
const answer = (page: Page, label: string) => page.getByLabel(label, { exact: false });

/**
 * Pick a rating the way a person does: click the star, then assert the radio
 * behind it became checked — which is the label-to-input wiring the control
 * depends on.
 *
 * Two harness details live here rather than in each test. The row is centred in
 * the viewport first, because the site nav is `position: fixed` and Playwright's
 * minimal scroll can leave a control underneath it, so the click lands on the
 * nav. And the click targets the LABEL, not the input: the star SVG sits inside
 * the label, so a click aimed at the input is reported as intercepted by it,
 * while a click on the label is satisfied by any descendant.
 */
async function pickRating(page: Page, value: number) {
  const star = page.locator('.fb-star').nth(value - 1);
  await star.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await star.click();
  await expect(page.getByRole('radio', { name: new RegExp(`^${value} out of 5`) })).toBeChecked();
}

/** The form's own error banner — Next's dev overlay also exposes role=alert. */
const banner = (page: Page) => page.locator('form [role="alert"]');

test.describe('/feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feedback');
    await expect(page.locator('h1')).toContainText('ClipMark');
  });

  test('is noindex and carries a self-referential canonical', async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/\/feedback$/);
    // og:url must agree with the canonical rather than inheriting the homepage's.
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).toMatch(/\/feedback$/);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('lights the rating in brand teal up to the star you pick', async ({ page }) => {
    await expect(stars(page)).toHaveCount(5);

    await pickRating(page, 4);

    // Move the pointer off the row so the hover colour isn't what we measure.
    await page.mouse.move(0, 0);

    for (let i = 0; i < 4; i++) {
      await expect(stars(page).nth(i)).toHaveCSS('color', TEAL_700);
    }
    await expect(stars(page).nth(4)).toHaveCSS('color', GRAY_400);
    await expect(page.locator('.fb-star-caption')).toContainText('I like it');
  });

  test('the rating is reachable and visibly focused from the keyboard', async ({ page }) => {
    const first = page.getByRole('radio', { name: /^1 out of 5/ });
    await first.focus();
    // Arrow keys move within a radio group — the standard behaviour we get by
    // using real radios rather than clickable spans.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /^2 out of 5/ })).toBeChecked();

    // The focus ring is drawn on the star that sits behind the transparent input.
    const outline = await stars(page).nth(1).evaluate(
      (el) => getComputedStyle(el).outlineWidth,
    );
    expect(parseFloat(outline)).toBeGreaterThan(0);
  });

  test('blocks an empty submit client-side, without a request', async ({ page }) => {
    let posted = 0;
    await page.route('**/api/feedback', (route) => {
      posted += 1;
      return route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await page.getByRole('button', { name: 'Send feedback' }).click();

    await expect(banner(page)).toContainText('One thing left to fix');
    await expect(page.locator('.fb-field-error')).toContainText('1 to 5 stars');
    expect(posted).toBe(0);
  });

  test('requires an answer, not just a rating', async ({ page }) => {
    await page.route('**/api/feedback', (route) =>
      route.fulfill({ status: 200, body: '{"ok":true}' }),
    );
    await pickRating(page, 5);
    await page.getByRole('button', { name: 'Send feedback' }).click();

    await expect(page.locator('.fb-field-error')).toContainText('at least one of the three questions');
  });

  test('sends the answers, the rating and the ?from= source, then confirms', async ({ page }) => {
    await page.goto('/feedback?from=side-panel');

    let body: Record<string, unknown> = {};
    await page.route('**/api/feedback', async (route) => {
      body = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await pickRating(page, 4);
    await answer(page, 'What do you like so far?').fill('The Alt+B shortcut.');
    await answer(page, 'What is confusing or missing?').fill('Where the loops live.');
    await answer(page, 'Email').fill('friend@example.com');
    await page.getByRole('button', { name: 'Send feedback' }).click();

    const success = page.locator('.fb-card[role="status"]');
    await expect(success).toContainText('Got it');
    // A reply is only promised when an address was actually left.
    await expect(success).toContainText('expect a reply');

    expect(body).toMatchObject({
      rating: 4,
      liked: 'The Alt+B shortcut.',
      confusing: 'Where the loops live.',
      feature_request: null,
      email: 'friend@example.com',
      source: 'side-panel',
    });
    // The form never posts an identity — the route stamps user_id itself.
    expect(body).not.toHaveProperty('user_id');
  });

  test('surfaces a server error and keeps what you typed', async ({ page }) => {
    await page.route('**/api/feedback', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":"save_failed","message":"We could not save that. Please try again."}',
      }),
    );

    await pickRating(page, 2);
    await answer(page, 'What is confusing or missing?').fill('The dashboard empty state.');
    await page.getByRole('button', { name: 'Send feedback' }).click();

    await expect(banner(page)).toContainText('could not save');
    await expect(answer(page, 'What is confusing or missing?')).toHaveValue('The dashboard empty state.');
    await expect(page.getByRole('button', { name: 'Send feedback' })).toBeEnabled();
  });
});
