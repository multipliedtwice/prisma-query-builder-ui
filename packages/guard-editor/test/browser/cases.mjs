import { expect } from '@playwright/test';

export const storageKey = 'dee-wan.query-template-preview.v1';
export async function selectQuery(page, id) {
  const mobile = page.getByLabel('Saved query', { exact: true });
  if (await mobile.isVisible()) await mobile.selectOption(id);
  else await page.getByRole('navigation', { name: 'Query usages' }).getByRole('button').filter({ has: page.locator('.query-list-usage', { hasText: new RegExp(`^${id}$`) }) }).click();
}
export async function showCode(page) {
  const button = page.getByRole('button', { name: 'Prisma query', exact: true });
  if (await button.isVisible()) await button.click();
  return page.getByRole('textbox', { name: 'Prisma query', exact: true });
}
export async function showBuilder(page) {
  const button = page.getByRole('button', { name: 'Builder', exact: true });
  if (await button.isVisible()) await button.click();
}
export async function action(page, name) {
  await page.getByLabel('Query actions', { exact: true }).click();
  await page.locator('.query-more-actions').getByRole('button', { name, exact: true }).click();
}
export async function noOverflow(page) {
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
}
export async function seed(page, queries, manifest) {
  await page.addInitScript(({ key, queries, manifest }) => localStorage.setItem(key, JSON.stringify({ queries, manifest })), { key: storageKey, queries, manifest });
}
export const workspaceCases = [
  { name: 'model, usage and original nested query are visible without policy internals', async run(page) {
    await expect(page.getByRole('region', { name: 'User saved queries' })).toBeVisible();
    await expect(page.locator('.query-active-identity')).toContainText('public-profile');
    await expect(page.getByRole('button', { name: 'Open select', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
    await expect(page.getByText(/JSON policy|Compiled guard|Projection permissions|\$force/)).toHaveCount(0);
    await noOverflow(page);
  } },
  { name: 'nested relation edits use the original tree and retain parent query context', async run(page) {
    await selectQuery(page, 'company-dashboard'); await page.getByRole('button', { name: 'Open select', exact: true }).click();
    await page.getByRole('button', { name: 'Open posts', exact: true }).click(); await page.getByRole('button', { name: 'Open select', exact: true }).click();
    await page.getByRole('button', { name: 'Add slug', exact: true }).click();
    await expect(page.locator('.query-save-state')).toHaveText('Unsaved changes');
    const code = await showCode(page); await expect(code).toContainText('posts:'); await expect(code).toContainText('slug: true');
  } },
  { name: 'saved concrete values are editable without execution', async run(page) {
    await selectQuery(page, 'talent-search'); const code = await showCode(page);
    await code.fill('await prisma.user.findMany({ select: { id: true }, where: { id: 9 }, take: 12 })');
    await expect(page.getByRole('button', { name: 'Save query', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save query', exact: true }).click();
    await expect(page.locator('.query-save-state')).toContainText('Saved');
    const item = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).queries.find(query => query.id === 'talent-search'), storageKey);
    expect(item.payload.where.id).toBe(9); expect(item.payload.take).toBe(12); expect(item.accepted).toBe(false);
  } },
  { name: 'dirty edits remain associated with their query across switching', async run(page) {
    await page.getByRole('button', { name: 'Open select', exact: true }).click(); await page.getByRole('button', { name: 'Add email', exact: true }).click();
    await selectQuery(page, 'account'); await expect(page.locator('.query-save-state')).toHaveText('Saved');
    await selectQuery(page, 'public-profile'); await expect(page.locator('.query-save-state')).toHaveText('Unsaved changes');
    const code = await showCode(page); await expect(code).toContainText('email: true');
  } },
  { name: 'create, rename, duplicate, save, reload, and confirmed delete are explicit', async run(page) {
    await page.getByRole('button', { name: 'New query', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Assignment autocomplete'); await dialog.getByLabel('Usage key', { exact: true }).fill('assignment-autocomplete');
    await dialog.getByRole('button', { name: 'Create query', exact: true }).click();
    await action(page, 'Rename'); await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Assignment lookup');
    await page.getByRole('dialog').getByRole('button', { name: 'Rename query', exact: true }).click();
    await page.getByRole('button', { name: 'Save query', exact: true }).click(); await expect(page.locator('.query-save-state')).toContainText('Saved');
    await action(page, 'Duplicate'); await page.getByRole('dialog').getByRole('button', { name: 'Create query', exact: true }).click();
    await expect(page.locator('.query-active-identity')).toContainText('assignment-autocomplete-copy');
    await page.getByRole('button', { name: 'Save query', exact: true }).click();
    await page.reload();
    const items = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).queries, storageKey); const copy = items.find(query => query.usageKey === 'assignment-autocomplete-copy');
    const mobile = page.getByLabel('Saved query', { exact: true });
    if (await mobile.isVisible()) await mobile.selectOption(copy.id); else await page.getByRole('navigation', { name: 'Query usages' }).getByRole('button').filter({ hasText: 'assignment-autocomplete-copy' }).click();
    await action(page, 'Delete'); await expect(page.getByRole('dialog')).toContainText('Delete query?');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.locator('.query-active-identity')).toContainText('assignment-autocomplete-copy');
    await action(page, 'Delete'); await page.getByRole('dialog').getByRole('button', { name: 'Delete query', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByLabel('Query actions', { exact: true })).toBeFocused();
    expect(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)).queries.some(query => query.id === id), { key: storageKey, id: copy.id })).toBe(false);
  } },
  { name: 'two registered application routes visibly share one template', async run(page) {
    await page.getByRole('button', { name: 'Used by 2 routes', exact: true }).click(); const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Public profile page', { exact: false })).toBeChecked();
    await expect(dialog.getByLabel('Profile summary panel', { exact: false })).toBeChecked();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  } },
  { name: 'linked query cannot be deleted until its routes are explicitly unlinked', async run(page) {
    await action(page, 'Delete'); const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Unlink this query'); await expect(dialog.getByRole('button', { name: 'Delete query', exact: true })).toBeDisabled();
  } },
  { name: 'save failure retains edits and offers a real retry', async run(page) {
    await page.getByRole('button', { name: 'Open select', exact: true }).click(); await page.getByRole('button', { name: 'Add email', exact: true }).click();
    await page.evaluate(() => { const original = Storage.prototype.setItem; let fail = true; Storage.prototype.setItem = function(key, value) { if (key === 'dee-wan.query-template-preview.v1' && fail) { fail = false; throw new DOMException('Storage quota failure', 'QuotaExceededError'); } return original.call(this, key, value); }; });
    await page.getByRole('button', { name: 'Save query', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Storage quota failure');
    await expect(page.locator('.query-save-state')).toHaveText('Unsaved changes'); await page.getByRole('button', { name: 'Save query', exact: true }).click();
    await expect(page.locator('.query-save-state')).toContainText('Saved');
  } },
  { name: 'invalid query code is retained across switching and cannot be saved', async run(page) {
    const code = await showCode(page); await code.fill('await prisma.user.findUnique({where:{id:missing()}})');
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: 'Save query', exact: true })).toBeDisabled();
    await selectQuery(page, 'account'); await selectQuery(page, 'public-profile');
    const returned = await showCode(page); await expect(returned).toContainText('missing()');
  } },
  { name: 'enum navigation changes the original field rather than nesting a duplicate path', async run(page) {
    await selectQuery(page, 'talent-search'); await page.getByRole('button', { name: 'Open orderBy', exact: true }).click();
    await page.getByRole('button', { name: 'Open id', exact: true }).click(); await page.getByRole('button', { name: 'desc', exact: true }).click();
    const code = await showCode(page); await expect(code).toContainText('id: "desc"'); await expect(code).not.toContainText('id: {');
  } },
  { name: 'acceptance is explicit and enabling is separate from saving', async run(page) {
    await page.getByRole('button', { name: 'Reopen as draft', exact: true }).click(); await expect(page.getByRole('button', { name: 'Accept query', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Accept query', exact: true }).click(); await page.getByLabel('Enabled', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save query', exact: true }).click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).queries.find(query => query.id === 'public-profile').enabled, storageKey)).toBe(false);
  } },
  { name: 'saved queries are grouped by operation beneath the model', async run(page) {
    const nav = page.getByRole('navigation', { name: 'Query usages' });
    if (await nav.isVisible()) {
      await expect(nav.getByRole('heading')).toHaveText([/^findMany/, /^findUnique/, /^update/]);
      await expect(nav.getByRole('region', { name: /^findMany/ }).locator('.query-list-usage')).toHaveText(['company-dashboard', 'talent-search']);
    } else await expect(page.getByLabel('Saved query', { exact: true }).locator('optgroup')).toHaveCount(3);
  } },
  { name: 'the whole argument card opens the argument', async run(page) {
    const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole('button', { name: 'Open select', exact: true }) });
    const box = await card.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + 4);
    await expect(page.getByRole('button', { name: 'Add email', exact: true })).toBeVisible();
  } },
  { name: 'query actions menu dismisses and dialogs return focus', async run(page) {
    const summary = page.getByLabel('Query actions', { exact: true }); const menu = page.locator('.query-more-actions');
    await summary.click(); await expect(menu).toHaveAttribute('open', ''); await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', ''); await expect(summary).toBeFocused();
    await summary.click(); await page.locator('.query-workspace-header').click({ position: { x: 4, y: 4 } }); await expect(menu).not.toHaveAttribute('open', '');
    await action(page, 'Rename'); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(summary).toBeFocused();
    const create = page.getByRole('button', { name: 'New query', exact: true }); await create.click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Staff list'); await dialog.getByLabel('Usage key', { exact: true }).fill('staff-list');
    await dialog.getByRole('button', { name: 'Create query', exact: true }).click(); await expect(create).toBeFocused();
  } },
  { name: 'duplicate usage keys and blank names are explained without internal identifiers', async run(page) {
    await page.getByRole('button', { name: 'New query', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('   '); await dialog.getByLabel('Usage key', { exact: true }).fill('account');
    await dialog.getByRole('button', { name: 'Create query', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText('Enter a query name.');
    await dialog.getByLabel('Name', { exact: true }).fill('Second account');
    await dialog.getByRole('button', { name: 'Create query', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Another findUnique query already uses the usage key “account”.');
  } },
  { name: 'saving keeps keyboard focus on the save control', async run(page) {
    await page.getByRole('button', { name: 'Open select', exact: true }).click(); await page.getByRole('button', { name: 'Add email', exact: true }).click();
    const save = page.getByRole('button', { name: 'Save query', exact: true }); await save.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.query-save-state')).toHaveText('Saved'); await expect(save).toBeFocused(); await expect(save).toBeDisabled();
  } },
  { name: 'narrow code view has no duplicate heading and keeps its tools in the toggle row', async run(page) {
    const toggle = page.getByRole('button', { name: 'Prisma query', exact: true });
    if (!(await toggle.isVisible())) { await expect(page.getByRole('heading', { name: 'Prisma Query', exact: true })).toBeVisible(); return; }
    await toggle.click(); await expect(page.getByRole('heading', { name: 'Prisma Query', exact: true })).toBeHidden();
    const row = await page.locator('.query-mobile-panes').boundingBox(); const format = await page.getByRole('button', { name: 'Format', exact: true }).boundingBox();
    const last = await toggle.boundingBox(); expect(format.y).toBeGreaterThanOrEqual(row.y - 1); expect(format.y + format.height).toBeLessThanOrEqual(row.y + row.height + 1);
    expect(format.x).toBeGreaterThanOrEqual(last.x + last.width); await noOverflow(page);
  } },
  { name: 'keyboard access reaches named controls and query creation', async run(page) {
    const button = page.getByRole('button', { name: 'New query', exact: true }); await button.focus(); await expect(button).toBeFocused();
    await button.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(button).toBeFocused();
    const select = page.getByRole('button', { name: 'Open select', exact: true }); await select.focus(); await select.press('Enter');
    await expect(page.getByRole('button', { name: 'Add email', exact: true })).toBeVisible(); await noOverflow(page);
  } },
];
