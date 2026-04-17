import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionCard } from './SessionCard';
import { makeRepData, makeSession } from '../test/factories';

// Chart.js uses canvas — stub getContext so it doesn't throw in jsdom
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function renderCard(overrides: Partial<Parameters<typeof SessionCard>[0]> = {}) {
  const session = makeSession('squat', [
    makeRepData({ score: 90 }),
    makeRepData({ score: 70, repNumber: 2 }),
  ]);
  const props = {
    session,
    expanded: false,
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<SessionCard {...props} />), session, props };
}

// ── Display ───────────────────────────────────────────────────────────────────

describe('SessionCard — display', () => {
  it('renders the lift label', () => {
    renderCard();
    expect(screen.getByText('Squat')).toBeInTheDocument();
  });

  it('renders the rep count', () => {
    renderCard();
    expect(screen.getByText(/2 reps/i)).toBeInTheDocument();
  });

  it('renders the avg score badge', () => {
    renderCard();
    // avg of 90 + 70 = 80 → "80/100"
    expect(screen.getByText(/80\/100/)).toBeInTheDocument();
  });

  it('shows collapsed chevron ▼ when not expanded', () => {
    renderCard({ expanded: false });
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('shows expanded chevron ▲ when expanded', () => {
    const session = makeSession('squat', [makeRepData()]);
    render(
      <SessionCard
        session={session}
        expanded={true}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it('renders SessionDetail when expanded', () => {
    const session = makeSession('squat', [makeRepData({ repNumber: 1, score: 88 })]);
    render(
      <SessionCard
        session={session}
        expanded={true}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // SessionDetail renders a "#1" rep number cell
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('does NOT render SessionDetail when collapsed', () => {
    renderCard({ expanded: false });
    expect(screen.queryByText('#1')).toBeNull();
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('SessionCard — interactions', () => {
  it('calls onToggle when header is clicked', () => {
    const { props } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /squat/i }));
    expect(props.onToggle).toHaveBeenCalledOnce();
  });

  it('first delete click shows Confirm and Cancel buttons', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /delete session/i }));
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel delete/i })).toBeInTheDocument();
  });

  it('calls onDelete only after Confirm is clicked', () => {
    const { props } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /delete session/i }));
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it('Cancel restores the delete button without calling onDelete', () => {
    const { props } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /delete session/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /delete session/i })).toBeInTheDocument();
  });

  it('does NOT call onToggle when delete button is clicked', () => {
    const { props } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /delete session/i }));
    expect(props.onToggle).not.toHaveBeenCalled();
  });
});

// ── Lift badge data-lift attribute ────────────────────────────────────────────

describe('SessionCard — lift badge color attribute', () => {
  it.each(['squat', 'deadlift', 'bench'] as const)('%s gets data-lift=%s', (lift) => {
    const session = makeSession(lift, [makeRepData({ lift })]);
    render(
      <SessionCard session={session} expanded={false} onToggle={vi.fn()} onDelete={vi.fn()} />,
    );
    const badge = screen.getByText(lift === 'bench' ? 'Bench Press' : lift === 'squat' ? 'Squat' : 'Deadlift');
    expect(badge).toHaveAttribute('data-lift', lift);
  });
});
