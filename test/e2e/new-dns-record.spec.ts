import { test, expect } from '@playwright/test';

import { loggedInAsUser } from './utils';

test.describe('not authenticated', () => {
  test('redirects to login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*login.*/);
  });
});

test.describe('authenticated as user', () => {
  loggedInAsUser();

  test.beforeEach(async ({ page }) => {
    await page.goto('/dns-records/new');
  });

  test('redirects to edit DNS record page when required fields are filled', async ({ page }) => {
    await page.getByLabel('Name*').fill('test');
    await page.getByRole('combobox', { name: 'Type' }).selectOption('A');
    await page.getByLabel('Value*').fill('test');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/.*dns-records\/[0-9]*/);
  });

  test('redirects to edit DNS record page when all fields are filled', async ({ page }) => {
    await page.getByLabel('Name*').fill('test');
    await page.getByRole('combobox', { name: 'Type' }).selectOption('A');
    await page.getByLabel('Value*').fill('test');
    await page.getByLabel('Ports').fill('port1, port2');
    await page.getByLabel('Course').fill('test course');
    await page.getByLabel('Description').fill('test description');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/.*dns-records\/[0-9]*/);
  });

  test('does not create DNS record if required fields are empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL('/dns-records/new');
  });
});
