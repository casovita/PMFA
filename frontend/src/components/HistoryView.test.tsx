import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryView } from './HistoryView';
import { makeRepData, makeSession } from '../test/factories';
import type { SavedSession } from '../types';

// Stub canvas so Chart.js doesn't throw in jsdom
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function renderView(sessions: SavedSession[] = [], onDelete = vi.fn()) {
  return render(<HistoryView sessions={sessions} onDeleteSession={onDelete} />);
}

/**
 * Card header buttons carry aria-expanded; filter buttons don't.
 * This helper returns only the session card headers.
 */
function getCardHeaders() {
  return screen
    .getAllByRole('button')
    .filter((btn) => btn.hasAttribute('aria-expanded'));
}

/**
 * The lift badge inside each card has a data-lift attribute.
 * Use this instead of text queries to avoid matching the filter bar buttons.
 */
function getLiftBadges(lift?: string) {
  const selector = lift ? `[data-lift="${lift}"]` : '[data-lift]';
  return document.querySelectorAll(selector);
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('HistoryView — empty state', () => {
  it('shows "No sessions recorded yet" when there are no sessions', () => {
    renderView([]);
    expect(screen.getByText(/no sessions recorded yet/i)).toBeInTheDocument();
  });

  it('shows a hint about saving sessions', () => {
    renderView([]);
    expect(screen.getByText(/sessions are saved automatically/i)).toBeInTheDocument();
  });

  it('shows lift-specific empty message when filtered and no matching sessions', () => {
    const sessions = [makeSession('squat', [makeRepData()])];
    renderView(sessions);
    fireEvent.click(screen.getByRole('button', { name: /^deadlift$/i }));
    expect(screen.getByText(/no deadlift sessions recorded/i)).toBeInTheDocument();
  });
});

// ── Session list ──────────────────────────────────────────────────────────────

describe('HistoryView — session list', () => {
  it('renders one card per session', () => {
    const sessions = [
      makeSession('squat',    [makeRepData()]),
      makeSession('deadlift', [makeRepData()]),
    ];
    renderView(sessions);
    // Use data-lift badges (inside cards) not filter bar text
    expect(getLiftBadges('squat')).toHaveLength(1);
    expect(getLiftBadges('deadlift')).toHaveLength(1);
  });

  it('shows newest session first (reverse chronological)', () => {
    const older = makeSession('squat',    [makeRepData()], { savedAt: 1000 });
    const newer = makeSession('deadlift', [makeRepData()], { savedAt: 2000 });
    renderView([older, newer]);

    const badges = document.querySelectorAll('[data-lift]');
    expect(badges[0]).toHaveAttribute('data-lift', 'deadlift');
    expect(badges[1]).toHaveAttribute('data-lift', 'squat');
  });
});

// ── Lift filter ───────────────────────────────────────────────────────────────

describe('HistoryView — lift filter', () => {
  const sessions = [
    makeSession('squat',    [makeRepData({ lift: 'squat'    })]),
    makeSession('deadlift', [makeRepData({ lift: 'deadlift' })]),
    makeSession('bench',    [makeRepData({ lift: 'bench'    })]),
  ];

  it('renders all filter buttons', () => {
    renderView(sessions);
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^squat$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^deadlift$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^bench$/i })).toBeInTheDocument();
  });

  it('defaults to showing all sessions', () => {
    renderView(sessions);
    expect(getLiftBadges('squat')).toHaveLength(1);
    expect(getLiftBadges('deadlift')).toHaveLength(1);
    expect(getLiftBadges('bench')).toHaveLength(1);
  });

  it('filters to squat only when Squat filter is active', () => {
    renderView(sessions);
    fireEvent.click(screen.getByRole('button', { name: /^squat$/i }));
    expect(getLiftBadges('squat')).toHaveLength(1);
    expect(getLiftBadges('deadlift')).toHaveLength(0);
    expect(getLiftBadges('bench')).toHaveLength(0);
  });

  it('filters to deadlift only when Deadlift filter is active', () => {
    renderView(sessions);
    fireEvent.click(screen.getByRole('button', { name: /^deadlift$/i }));
    expect(getLiftBadges('squat')).toHaveLength(0);
    expect(getLiftBadges('deadlift')).toHaveLength(1);
    expect(getLiftBadges('bench')).toHaveLength(0);
  });

  it('returns to all sessions after switching back to All', () => {
    renderView(sessions);
    fireEvent.click(screen.getByRole('button', { name: /^squat$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(getLiftBadges('squat')).toHaveLength(1);
    expect(getLiftBadges('deadlift')).toHaveLength(1);
    expect(getLiftBadges('bench')).toHaveLength(1);
  });

  it('marks the active filter button with data-active=true', () => {
    renderView(sessions);
    const sqBtn = screen.getByRole('button', { name: /^squat$/i });
    fireEvent.click(sqBtn);
    expect(sqBtn).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('data-active', 'false');
  });
});

// ── Expand / collapse ─────────────────────────────────────────────────────────

describe('HistoryView — expand / collapse', () => {
  it('starts with all sessions collapsed', () => {
    const sessions = [makeSession('squat', [makeRepData({ repNumber: 1 })])];
    renderView(sessions);
    expect(screen.queryByText('#1')).toBeNull();
  });

  it('expands a session when its header is clicked', () => {
    const sessions = [makeSession('squat', [makeRepData({ repNumber: 1 })])];
    renderView(sessions);
    fireEvent.click(getCardHeaders()[0]);
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('collapses a session when its header is clicked again', () => {
    const sessions = [makeSession('squat', [makeRepData({ repNumber: 1 })])];
    renderView(sessions);
    const header = getCardHeaders()[0];
    fireEvent.click(header);
    fireEvent.click(header);
    expect(screen.queryByText('#1')).toBeNull();
  });

  it('only one session can be expanded at a time', () => {
    const sessions = [
      makeSession('squat',    [makeRepData({ repNumber: 1, lift: 'squat'    })]),
      makeSession('deadlift', [makeRepData({ repNumber: 1, lift: 'deadlift' })]),
    ];
    renderView(sessions);
    const [first, second] = getCardHeaders();
    fireEvent.click(first);
    fireEvent.click(second);
    // Only one SessionDetail should be rendered → only one "#1" cell visible
    expect(screen.getAllByText('#1')).toHaveLength(1);
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe('HistoryView — delete', () => {
  it('calls onDeleteSession with the correct id', () => {
    const onDelete = vi.fn();
    const session = makeSession('squat', [makeRepData()]);
    renderView([session], onDelete);
    fireEvent.click(screen.getByRole('button', { name: /delete session/i }));
    expect(onDelete).toHaveBeenCalledWith(session.id);
  });

  it('collapses an expanded session when it is deleted', () => {
    const onDelete = vi.fn();
    const session = makeSession('squat', [makeRepData({ repNumber: 1 })]);
    const { rerender } = renderView([session], onDelete);

    fireEvent.click(getCardHeaders()[0]);
    expect(screen.getByText('#1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete session/i }));
    rerender(<HistoryView sessions={[]} onDeleteSession={onDelete} />);

    expect(screen.queryByText('#1')).toBeNull();
  });
});
