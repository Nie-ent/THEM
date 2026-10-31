import { expect, test } from '@playwright/test';

test('boots Phaser stage and React overlay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('overlay')).toBeVisible();
  expect(errors).toEqual([]);
});
