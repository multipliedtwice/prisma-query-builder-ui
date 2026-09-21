import { expect, test, type Page } from '@playwright/test';
import { OPERATIONS } from '../../src/core/types.js';

const editor = (page: Page) => page.locator('.guard-shape-builder');
const policyPreview = (page: Page) => editor(page).getByLabel('JSON policy preview');
async function readPolicy(page: Page) { return JSON.parse(await policyPreview(page).inputValue()); }

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(policyPreview(page)).toBeVisible();
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

for (const operation of OPERATIONS) {
  test(`${operation}: emits a complete validated controlled policy`, async ({ page }) => {
    await page.getByLabel('Operation fixture').selectOption(operation);
    const projection = editor(page).getByRole('group', { name: 'Return projection', exact: true });
    await projection.getByLabel('email', { exact: true }).check();
    await expect(page.getByTestId('change-count')).toHaveText('1');
    const value = await readPolicy(page);
    expect(value.operation).toBe(operation);
    expect(value.version).toBe(1);
    expect(value.select).toEqual([{ kind: 'field', field: 'email' }, { kind: 'field', field: 'id' }]);
    expect(Object.keys(value).sort()).toEqual(['version', 'model', 'operation', 'enabled', 'select', 'where', 'unique', 'orderBy', 'data', 'skip', 'take'].sort());
  });
}

test('unaccepted checkbox and numeric proposals do not replace the parent value', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle parent acceptance' }).click();
  const skip = editor(page).getByLabel('Allow skip');
  await skip.click();
  await expect(skip).not.toBeChecked();
  expect((await readPolicy(page)).skip).toBe(false);
  await editor(page).getByRole('group', { name: 'Operation pagination' }).getByLabel('Default page size').fill('10');
  await expect(editor(page).getByRole('group', { name: 'Operation pagination' }).getByLabel('Default page size')).toHaveValue('25');
  expect((await readPolicy(page)).take.default).toBe(25);
  await expect(page.getByTestId('change-count')).toHaveText('2');
});

test('read-only state disables mutation without disabling preview or navigation', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle read-only' }).click();
  await expect(editor(page).getByText('Read-only policy')).toBeVisible();
  const controls = editor(page).locator('input:not([readonly]),select,textarea:not([readonly])');
  for (const control of await controls.all()) await expect(control).toBeDisabled();
  const navigation = editor(page).getByRole('button', { name: /^posts → Post/ });
  await navigation.click();
  await expect(navigation).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('unknown policy, narrowed capabilities and mismatched identity refuse without resetting', async ({ page }) => {
  await page.getByRole('button', { name: 'Supply invalid policy' }).click();
  await expect(editor(page).getByRole('alert')).toContainText('Policy refused');
  await expect(editor(page).getByLabel('Enable operation')).toHaveCount(0);
  await expect(page.getByTestId('change-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Restore valid policy' }).click();
  await page.getByRole('button', { name: 'Narrow capabilities' }).click();
  await expect(editor(page).getByRole('alert')).toContainText('Projection is not allowed');
  await page.getByRole('button', { name: 'Restore valid policy' }).click();
  await page.getByRole('button', { name: 'Change identity only' }).click();
  await expect(editor(page).getByRole('alert')).toContainText('does not match');
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('invalid changes display associated errors and keep the existing policy', async ({ page }) => {
  const bounds = editor(page).getByRole('group', { name: 'Operation pagination' });
  const input = bounds.getByLabel('Maximum page size');
  await input.fill('101');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await input.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText('policy has not changed');
  await expect(page.getByTestId('change-count')).toHaveText('0');
  expect((await readPolicy(page)).take.max).toBe(100);
  await input.fill('50');
  await expect(page.getByTestId('change-count')).toHaveText('1');
  expect((await readPolicy(page)).take.max).toBe(50);
  await editor(page).getByRole('group', { name: 'Return projection', exact: true }).getByLabel('id', { exact: true }).click();
  await expect(editor(page).getByText('Change refused.', { exact: true })).toBeVisible();
  expect((await readPolicy(page)).select).toEqual([{ kind: 'field', field: 'id' }]);
});

test('forced sources use supplied labels and are never resolved in the component', async ({ page }) => {
  const control = editor(page).getByLabel('Forced predicate for tenantId');
  await expect(control.locator('option', { hasText: 'Current tenant' })).toHaveAttribute('value', 'source:actorTenant');
  await control.selectOption('source:actorTenant');
  expect((await readPolicy(page)).where).toEqual([{ kind: 'forced', field: 'tenantId', value: { kind: 'source', name: 'actorTenant' } }]);
  await expect(editor(page).getByText(/Named sources are never resolved by this editor/)).toBeVisible();
  await expect(editor(page).locator('input[type="text"],textarea:not([readonly])')).toHaveCount(0);
});

test('literal data is parsed as JSON, validated, and previewed with an explicit force marker', async ({ page }) => {
  await page.getByLabel('Operation fixture').selectOption('create');
  await editor(page).getByLabel('Data rule for tenantId').selectOption('literal');
  const literal = editor(page).getByLabel('JSON literal for tenantId');
  await literal.fill('return currentUser.tenant');
  const rule = literal.locator('..');
  await rule.getByRole('button', { name: 'Apply literal' }).click();
  await expect(literal).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('change-count')).toHaveText('0');
  await literal.fill('"tenant-1"');
  await rule.getByRole('button', { name: 'Apply literal' }).click();
  await expect(page.getByTestId('change-count')).toHaveText('1');
  await expect(editor(page).getByLabel('Compiled guard shape preview')).toHaveValue(/"\$force": "tenant-1"/);
});

test('keyboard focus is visible and native controls operate without a pointer', async ({ page }) => {
  const enabled = editor(page).getByLabel('Enable operation');
  await enabled.focus();
  await page.keyboard.press('Space');
  await expect(enabled).not.toBeChecked();
  await expect(page.getByTestId('change-count')).toHaveText('1');
  const focusStyle = await enabled.evaluate(element => {
    const target = element.closest('label') ?? element;
    const style = getComputedStyle(target);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(focusStyle.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Tab');
  await expect(editor(page).getByRole('group', { name: 'Return projection', exact: true }).getByRole('checkbox').first()).toBeFocused();
});

test('long names wrap and all visible mutation targets remain usable without page overflow', async ({ page }, info) => {
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  const targets = await editor(page).locator('input,select,textarea,button').evaluateAll(elements => elements.map(element => {
    const effectiveTarget = element.matches('input[type=checkbox]') ? element.closest('label') ?? element : element;
    return effectiveTarget.getBoundingClientRect().height;
  }));
  expect(targets.length).toBeGreaterThan(20);
  expect(targets.every(height => height >= 44)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${info.project.name}.png`) });
});

test('editing causes no network, execution, or browser persistence effects', async ({ page }) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const fail = () => { throw new Error('Forbidden editor side effect'); };
    window.fetch = fail;
    Storage.prototype.setItem = fail;
    Storage.prototype.removeItem = fail;
    Storage.prototype.clear = fail;
    IDBFactory.prototype.open = fail;
    XMLHttpRequest.prototype.open = fail;
  });
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await editor(page).getByLabel('Allow skip').check();
  await editor(page).getByRole('group', { name: 'Return projection', exact: true }).getByLabel('email', { exact: true }).check();
  await editor(page).getByLabel('Forced predicate for tenantId').selectOption('source:actorTenant');
  await expect(page.getByTestId('change-count')).toHaveText('3');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
