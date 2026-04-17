/**
 * E2E tests — Analyze view via Playwright.
 *
 * Camera access is not available in headless Chrome without fake device flags,
 * so webcam-dependent tests are skipped or use file upload path only.
 */

import { test, expect } from '@playwright/test';

// ── Page load ─────────────────────────────────────────────────────────────────

test.describe('Analyze — page load', () => {
  test('loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    expect(errors).toHaveLength(0);
  });

  test('shows PMFA title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('shows Analyze view by default', async ({ page }) => {
    await page.goto('/');
    // Analyze button has data-active=true
    const analyzeBtn = page.getByRole('button', { name: 'Analyze' });
    await expect(analyzeBtn).toHaveAttribute('data-active', 'true');
  });

  test('History button is visible in header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
  });
});

// ── Lift selector ─────────────────────────────────────────────────────────────

test.describe('Analyze — lift selector', () => {
  test('shows Squat, Deadlift and Bench buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Squat' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deadlift' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bench' }).first()).toBeVisible();
  });

  test('Squat is selected by default', async ({ page }) => {
    await page.goto('/');
    // The active lift button should have data-active=true
    const squatBtn = page.getByRole('button', { name: 'Squat' }).first();
    await expect(squatBtn).toHaveAttribute('data-active', 'true');
  });

  test('clicking Deadlift selects it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Deadlift' }).first().click();
    const deadliftBtn = page.getByRole('button', { name: 'Deadlift' }).first();
    await expect(deadliftBtn).toHaveAttribute('data-active', 'true');
  });

  test('selecting Bench deselects Squat', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Bench' }).first().click();
    const squatBtn = page.getByRole('button', { name: 'Squat' }).first();
    await expect(squatBtn).toHaveAttribute('data-active', 'false');
  });
});

// ── Camera guide ──────────────────────────────────────────────────────────────

test.describe('Analyze — camera guide (idle state)', () => {
  test('shows camera guide when idle', async ({ page }) => {
    await page.goto('/');
    // CameraGuide renders a table with setup instructions
    await expect(page.locator('table')).toBeVisible();
  });

  test('CameraGuide updates when lift changes', async ({ page }) => {
    await page.goto('/');
    // Squat guide content visible initially
    const squatText = page.getByText(/sagittal/i);
    await expect(squatText.first()).toBeVisible();

    // Switch to Deadlift — CameraGuide re-renders
    await page.getByRole('button', { name: 'Deadlift' }).first().click();
    // Table still visible (guide still shown)
    await expect(page.locator('table')).toBeVisible();
  });
});

// ── Video upload controls ─────────────────────────────────────────────────────

test.describe('Analyze — video upload UI', () => {
  test('shows Upload Video label in idle state', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Upload Video')).toBeVisible();
  });

  test('shows Use Webcam / Live Camera button', async ({ page }) => {
    await page.goto('/');
    // The webcam button text may vary — check for either
    const webcamBtn = page.getByRole('button').filter({ hasText: /webcam|camera/i });
    await expect(webcamBtn.first()).toBeVisible();
  });

  test('file input accepts video files', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept="video/*"]');
    await expect(fileInput).toBeAttached();
  });
});

// ── No nested button DOM violations ──────────────────────────────────────────

test.describe('Analyze — DOM structure', () => {
  test('no nested button elements', async ({ page }) => {
    await page.goto('/');
    // Navigate to history to also render SessionCards
    const nestedButtons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      return allButtons.filter((btn) => btn.querySelector('button') !== null).length;
    });
    expect(nestedButtons).toBe(0);
  });
});

// ── View toggle accessibility ─────────────────────────────────────────────────

test.describe('Analyze — view toggle', () => {
  test('Analyze button has data-active=true in analyze view', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  test('History button has data-active=false in analyze view', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'History' })).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  test('clicking History sets data-active=true on History button', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: 'History' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });
});
