import { test, expect } from '@playwright/test';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

test('player combat page requires login', async ({ page }) => {
  await page.goto(`${baseUrl}/player/campaigns/test/combat`);
  await expect(page.getByText('Please log in to access combat.')).toBeVisible();
});

test('GM combat page requires login', async ({ page }) => {
  await page.goto(`${baseUrl}/gm/campaigns/test/combat`);
  await expect(page.getByText('Please log in to access combat.')).toBeVisible();
});
