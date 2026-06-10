import { test, expect } from '@playwright/test';

test.describe('Guayafood Landing Page', () => {

  test('homepage loads and shows title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Guayafood/);
  });

  test('hero section has heading and CTA', async ({ page }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { name: /corazón/ });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('corazón');

    const cta = page.locator('a[href*="wa.me"]').first();
    await expect(cta).toBeVisible();
  });

  test('navigation links work', async ({ page }) => {
    await page.goto('/');
    const productosLink = page.getByRole('link', { name: 'Ver productos' });
    await expect(productosLink).toBeVisible();

    await productosLink.click();
    await expect(page.locator('#productos')).toBeVisible();
  });

  test('productos section has 3 products', async ({ page }) => {
    await page.goto('/');
    await page.locator('#productos').scrollIntoViewIfNeeded();
    const products = page.locator('#productos .grid > div');
    await expect(products).toHaveCount(3);
  });

  test('combos section shows 3 combos', async ({ page }) => {
    await page.goto('/');
    await page.locator('#combos').scrollIntoViewIfNeeded();
    const combos = page.locator('#combos .grid > div');
    await expect(combos).toHaveCount(3);
  });

  test('WhatsApp link has correct number', async ({ page }) => {
    await page.goto('/');
    const waLinks = page.locator('a[href*="wa.me"]');
    const count = await waLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const href = await waLinks.first().getAttribute('href');
    expect(href).toContain('5491123861180');
  });

  test('gallery section has 6 items', async ({ page }) => {
    await page.goto('/');
    await page.locator('#galeria').scrollIntoViewIfNeeded();
    const items = page.locator('#galeria .grid > div');
    await expect(items).toHaveCount(6);
  });

  test('como pedir section has 3 steps', async ({ page }) => {
    await page.goto('/');
    await page.locator('#como-pedir').scrollIntoViewIfNeeded();
    const steps = page.locator('#como-pedir .grid > div');
    await expect(steps).toHaveCount(3);
  });

  test('footer has contact info', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('GUAYAFOOD');
  });

  test('page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByRole('heading', { name: /corazón/ })).toBeVisible();
  });

  test('404 page works', async ({ page }) => {
    const response = await page.goto('/pagina-que-no-existe');
    expect(response?.status()).toBe(404);
  });

});
