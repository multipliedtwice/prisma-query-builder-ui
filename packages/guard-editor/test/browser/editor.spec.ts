import { expect, test } from '@playwright/test';
import { workspaceCases } from './cases.mjs';
import { fixtureCases } from './fixture-cases.js';
for (const entry of workspaceCases) test(entry.name, async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.saved-query-workspace')).toBeVisible(); await entry.run(page);
});
fixtureCases();

test('read-only mode permits tree navigation but not changes or saving', async ({ page }) => {
  await page.goto('/?readonly'); await expect(page.getByRole('button', { name: 'New query', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open select', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add email', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save query', exact: true })).toBeDisabled();
  await expect(page.getByText('Read-only access. Queries can be inspected but not changed.')).toBeVisible(); await expect(page.getByLabel('Query actions', { exact: true })).toHaveCount(0);
});
test('saving pins a snapshot and leaves later edits dirty after acknowledgment', async ({ page }) => {
  await page.goto('/?pending-save'); await page.getByRole('button', { name: 'Open select', exact: true }).click();
  await page.getByRole('button', { name: 'Add email', exact: true }).click(); await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove name', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save query', exact: true })).toBeEnabled(); await expect(page.locator('.query-save-state')).toHaveText('Unsaved changes');
});
