import { test, expect } from '@playwright/test';

test('app loads and renders the UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app__title')).toHaveText('Legion Browser Agent Mesh');
});

test('prompt input is visible and functional', async ({ page }) => {
  await page.goto('/');
  const textarea = page.locator('.prompt-input__textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill('test prompt');
  await expect(textarea).toHaveValue('test prompt');
});

test('mesh graph shows empty state initially', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mesh-graph__empty')).toBeVisible();
});
