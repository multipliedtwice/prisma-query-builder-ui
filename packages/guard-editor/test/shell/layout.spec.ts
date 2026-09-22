import { expect, test } from '@playwright/test';
import { workspaceCases, noOverflow } from '../browser/cases.mjs';
for (const entry of workspaceCases) test(`application layout: ${entry.name}`, async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Queries', exact: true })).toBeVisible();
  await expect(page.locator('#main-content .saved-query-workspace')).toBeVisible();
  await entry.run(page);
});
test('existing sidebar, identity and site switcher surround the workspace', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Queries', exact: true })).toBeVisible();
  if (info.project.name.startsWith('mobile')) await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(page.getByTestId('sidebar-brand-name')).toHaveText('Dee Wan CMS');
  await expect(page.getByTestId('site-switcher-name')).toHaveText('Preview site'); await expect(page.getByTestId('identity-email')).toHaveText('preview@example.invalid');
  await expect(page.getByRole('link', { name: 'Content Builder', exact: true }).first()).toBeVisible();
  await noOverflow(page);
});
test('workspace inherits the real application dark theme', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => document.documentElement.classList.add('dark'));
  const tokens = await page.locator('.saved-query-workspace').evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(tokens.foreground).not.toBe(tokens.background); await noOverflow(page);
 
});

import { fixtureCases } from '../browser/fixture-cases.js';
fixtureCases();
test('tablet width with the open sidebar keeps the builder readable', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 }); await page.goto('/');
  await expect(page.getByLabel('Saved query', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Query usages' })).toBeHidden();
  const card = await page.locator('[data-slot="card"]').filter({ has: page.getByRole('button', { name: 'Open select', exact: true }) }).boundingBox();
  expect(card.width).toBeGreaterThan(280); await noOverflow(page);
});
