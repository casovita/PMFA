/**
 * E2E tests — History view via Playwright.
 *
 * Strategy: inject fixture sessions directly into localStorage before navigating,
 * then verify the UI reflects the stored data without requiring a live camera.
 */

import { test, expect, type Page } from '@playwright/test';

const STORAGE_KEY = 'pmfa_sessions_v1';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRep(overrides: Record<string, unknown> = {}) {
  return {
    repNumber: 1,
    primaryAngle: 95,
    trunkLean: 10,
    timeUnderTension: 2.5,
    score: 85,
    violations: [],
    fatigueFlags: [],
    qualityLabel: 'good',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeSession(
  lift: string,
  scores: number[],
  overrides: Record<string, unknown> = {},
) {
  const reps = scores.map((score, i) => makeRep({ repNumber: i + 1, score }));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    lift,
    reps,
    aggregate: {
      repCount: reps.length,
      avgScore: avg,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      scores,
      avgPrimaryAngle: 95,
      avgTimeUnderTension: 2.5,
      totalViolations: 0,
      worstSeverity: null,
    },
    ...overrides,
  };
}

async function seedSessions(page: Page, sessions: unknown[]) {
  await page.addInitScript(
    ({ key, data }: { key: string; data: string }) => {
      localStorage.setItem(key, data);
    },
    { key: STORAGE_KEY, data: JSON.stringify(sessions) },
  );
}

async function openHistory(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
}

// ── Empty state ───────────────────────────────────────────────────────────────

test.describe('History — empty state', () => {
  test('shows empty state when no sessions recorded', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByText('No sessions recorded yet')).toBeVisible();
  });

  test('empty state shows instruction hint', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(
      page.getByText(/Complete an analysis and stop recording/i),
    ).toBeVisible();
  });
});

// ── Session card rendering ─────────────────────────────────────────────────────

test.describe('History — session card rendering', () => {
  test('shows session card when session is stored', async ({ page }) => {
    const session = makeSession('squat', [80, 90]);
    await seedSessions(page, [session]);
    await openHistory(page);

    // Lift badge is visible
    await expect(page.locator('[data-lift="squat"]').first()).toBeVisible();
  });

  test('shows rep count on card', async ({ page }) => {
    const session = makeSession('deadlift', [75, 85, 90]);
    await seedSessions(page, [session]);
    await openHistory(page);
    await expect(page.getByText(/3 reps/i)).toBeVisible();
  });

  test('shows avg score badge on card', async ({ page }) => {
    // avg of 80 + 100 = 90
    const session = makeSession('squat', [80, 100]);
    await seedSessions(page, [session]);
    await openHistory(page);
    await expect(page.getByText(/90\/100/)).toBeVisible();
  });

  test('renders multiple session cards', async ({ page }) => {
    const sessions = [
      makeSession('squat', [80], { savedAt: Date.now() - 2000 }),
      makeSession('deadlift', [70], { savedAt: Date.now() - 1000 }),
      makeSession('bench', [60]),
    ];
    await seedSessions(page, sessions);
    await openHistory(page);

    // All three lift badges present
    await expect(page.locator('[data-lift="squat"]')).toHaveCount(1);
    await expect(page.locator('[data-lift="deadlift"]')).toHaveCount(1);
    await expect(page.locator('[data-lift="bench"]')).toHaveCount(1);
  });
});

// ── Expand / collapse ─────────────────────────────────────────────────────────

test.describe('History — expand / collapse', () => {
  test('card is collapsed by default', async ({ page }) => {
    const session = makeSession('squat', [makeRep({ repNumber: 1, score: 88 }).score]);
    await seedSessions(page, [session]);
    await openHistory(page);

    // Detail table row '#1' should not exist
    await expect(page.getByText('#1')).not.toBeVisible();
  });

  test('clicking card header expands it', async ({ page }) => {
    const session = makeSession('squat', [88]);
    await seedSessions(page, [session]);
    await openHistory(page);

    // Find the expand button (aria-expanded attribute)
    const expandBtn = page.locator('button[aria-expanded]').first();
    await expandBtn.click();

    await expect(page.getByText('#1')).toBeVisible();
  });

  test('clicking expanded card collapses it', async ({ page }) => {
    const session = makeSession('squat', [88]);
    await seedSessions(page, [session]);
    await openHistory(page);

    const expandBtn = page.locator('button[aria-expanded]').first();
    await expandBtn.click();
    await expect(page.getByText('#1')).toBeVisible();

    await expandBtn.click();
    await expect(page.getByText('#1')).not.toBeVisible();
  });

  test('only one card can be expanded at a time', async ({ page }) => {
    const sessions = [
      makeSession('squat', [88]),
      makeSession('deadlift', [75]),
    ];
    await seedSessions(page, sessions);
    await openHistory(page);

    const expandBtns = page.locator('button[aria-expanded]');
    await expandBtns.nth(0).click();
    await expandBtns.nth(1).click();

    // First card should now be collapsed (its rep row disappears)
    // Second expanded card shows rep #1
    await expect(page.getByText('#1')).toHaveCount(1);
  });
});

// ── Delete ─────────────────────────────────────────────────────────────────────

test.describe('History — delete', () => {
  test('delete button removes session card', async ({ page }) => {
    const session = makeSession('squat', [80, 90]);
    await seedSessions(page, [session]);
    await openHistory(page);

    await expect(page.locator('[data-lift="squat"]')).toBeVisible();
    await page.getByRole('button', { name: /delete session/i }).click();
    await expect(page.locator('[data-lift="squat"]')).not.toBeVisible();
  });

  test('empty state appears after last session deleted', async ({ page }) => {
    const session = makeSession('deadlift', [70]);
    await seedSessions(page, [session]);
    await openHistory(page);

    await page.getByRole('button', { name: /delete session/i }).click();
    await expect(page.getByText('No sessions recorded yet')).toBeVisible();
  });

  test('delete removes session from localStorage', async ({ page }) => {
    const session = makeSession('bench', [60]);
    await seedSessions(page, [session]);
    await openHistory(page);

    await page.getByRole('button', { name: /delete session/i }).click();

    // Read localStorage
    const stored = await page.evaluate(
      (key: string) => localStorage.getItem(key),
      STORAGE_KEY,
    );
    const parsed = stored ? JSON.parse(stored) : [];
    expect(parsed).toHaveLength(0);
  });
});

// ── Lift filter ───────────────────────────────────────────────────────────────

test.describe('History — lift filter', () => {
  async function seedMixed(page: Page) {
    const sessions = [
      makeSession('squat', [80]),
      makeSession('squat', [85]),
      makeSession('deadlift', [70]),
    ];
    await seedSessions(page, sessions);
    await openHistory(page);
  }

  test('All filter shows all sessions', async ({ page }) => {
    await seedMixed(page);
    await expect(page.locator('[data-lift]')).toHaveCount(3);
  });

  test('Squat filter hides deadlift sessions', async ({ page }) => {
    await seedMixed(page);
    await page.getByRole('button', { name: 'Squat' }).first().click();

    await expect(page.locator('[data-lift="squat"]')).toHaveCount(2);
    await expect(page.locator('[data-lift="deadlift"]')).toHaveCount(0);
  });

  test('Deadlift filter shows only deadlift session', async ({ page }) => {
    await seedMixed(page);
    await page.getByRole('button', { name: 'Deadlift' }).first().click();

    await expect(page.locator('[data-lift="deadlift"]')).toHaveCount(1);
    await expect(page.locator('[data-lift="squat"]')).toHaveCount(0);
  });

  test('filter with no matching sessions shows empty state', async ({ page }) => {
    await seedMixed(page);
    await page.getByRole('button', { name: 'Bench' }).first().click();

    await expect(page.getByText(/No Bench Press sessions recorded/i)).toBeVisible();
  });

  test('switching back to All restores all sessions', async ({ page }) => {
    await seedMixed(page);
    await page.getByRole('button', { name: 'Squat' }).first().click();
    await page.getByRole('button', { name: 'All' }).first().click();

    await expect(page.locator('[data-lift]')).toHaveCount(3);
  });
});

// ── Persistence across reload ─────────────────────────────────────────────────

test.describe('History — localStorage persistence', () => {
  test('sessions survive a page reload', async ({ page }) => {
    const session = makeSession('squat', [90, 85]);
    await seedSessions(page, [session]);
    await openHistory(page);

    await expect(page.locator('[data-lift="squat"]')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'History' }).click();

    await expect(page.locator('[data-lift="squat"]')).toBeVisible();
  });
});

// ── View toggle ───────────────────────────────────────────────────────────────

test.describe('App — view toggle', () => {
  test('starts in Analyze view by default', async ({ page }) => {
    await page.goto('/');
    // LiftSelector only visible in analyze view
    await expect(page.getByRole('button', { name: 'Squat' }).first()).toBeVisible();
  });

  test('switching to History hides LiftSelector', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    // LiftSelector buttons are gone from analyze panel
    await expect(page.getByRole('button', { name: /Squat/i }).filter({ hasText: 'Squat' }).nth(1)).not.toBeVisible();
  });

  test('switching back to Analyze restores analyze layout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Analyze' }).click();
    await expect(page.getByRole('button', { name: 'Squat' }).first()).toBeVisible();
  });
});
