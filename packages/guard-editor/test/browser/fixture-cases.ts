import { expect, test } from '@playwright/test';
import { seed, storageKey, noOverflow } from './cases.mjs';
import { exampleQueries, exampleManifest, templateContext } from '../fixtures/templates.js';
export function fixtureCases() {
  test('empty state starts a concrete query, not a policy form', async ({ page }) => {
    await seed(page, [], { version: 1, schema: templateContext.identity, bindings: [] }); await page.goto('/');
    await expect(page.getByRole('heading', { name: 'No queries for User', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create query', exact: true }).click(); await expect(page.getByRole('dialog').getByLabel('Usage key', { exact: true })).toBeVisible();
  });
  test('stale query is clearly blocked until explicit review', async ({ page }) => {
    const queries = structuredClone(exampleQueries); queries[0].schema.revision = 'old'; await seed(page, queries, exampleManifest); await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('schema changed'); await page.getByRole('button', { name: 'Review & accept', exact: true }).click();
    await page.getByRole('button', { name: 'Save query', exact: true }).click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).queries[0].schema.revision, storageKey)).toBe('1');
  });
  test('invalid query names the argument at fault', async ({ page }) => {
    const queries = structuredClone(exampleQueries); queries[0].payload.take = 500; queries[0].operation = 'findMany'; queries[0].payload = { select: { id: true }, take: 500 };
    await seed(page, queries, { version: 1, schema: templateContext.identity, bindings: [] }); await page.goto('/');
    await expect(page.locator('.query-state')).toHaveText('invalid'); await expect(page.locator('.query-issue')).toHaveText(/^take: /);
  });
  test('long names and many variants fit without page overflow', async ({ page }) => {
    const variants = Array.from({ length: 40 }, (_, index) => ({ ...structuredClone(exampleQueries[0]), id: `long-${index}`, usageKey: `application-usage-with-a-long-name-${index}`, name: `Long application query with detailed usage name ${index} `.repeat(5), accepted: false }));
    await seed(page, variants, { version: 1, schema: templateContext.identity, bindings: [] }); await page.goto('/');
    await expect(page.locator('.query-active-identity')).toContainText('application-usage-with-a-long-name-0'); await noOverflow(page);
  });
}
