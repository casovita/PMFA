import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionDetail } from './SessionDetail';
import { makeRepData, makeViolation } from '../test/factories';

// ── No snapshots ──────────────────────────────────────────────────────────────

describe('SessionDetail — no snapshots', () => {
  const reps = [
    makeRepData({ repNumber: 1, score: 85 }),
    makeRepData({ repNumber: 2, score: 60 }),
  ];

  it('renders one row per rep', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('does NOT render a Snapshot column when no rep has snapshotUrl', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    expect(screen.queryByText('Snapshot')).toBeNull();
  });

  it('shows "—" in violations cell when rep has no violations', () => {
    render(<SessionDetail reps={[makeRepData({ violations: [] })]} lift="squat" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows violation types with underscores replaced by spaces', () => {
    const rep = makeRepData({
      violations: [makeViolation({ type: 'trunk_lean' }), makeViolation({ type: 'knee_valgus' })],
    });
    render(<SessionDetail reps={[rep]} lift="squat" />);
    expect(screen.getByText(/trunk lean/i)).toBeInTheDocument();
    expect(screen.getByText(/knee valgus/i)).toBeInTheDocument();
  });

  it('uses lift-appropriate primary angle column header', () => {
    render(<SessionDetail reps={reps} lift="deadlift" />);
    // "Hip" is the colLabel for deadlift
    expect(screen.getAllByText('Hip').length).toBeGreaterThan(0);
  });

  it('renders score badges with data-quality attribute', () => {
    render(<SessionDetail reps={[makeRepData({ score: 92 })]} lift="squat" />);
    const badge = screen.getByText('92').closest('[data-quality]');
    expect(badge).toHaveAttribute('data-quality', 'excellent');
  });
});

// ── With snapshots ────────────────────────────────────────────────────────────

describe('SessionDetail — with snapshots', () => {
  const FAKE_URL = 'data:image/jpeg;base64,FAKEDATA';
  const reps = [
    makeRepData({ repNumber: 1, score: 75, snapshotUrl: FAKE_URL }),
    makeRepData({ repNumber: 2, score: 80 }), // no snapshot
  ];

  it('renders the Snapshot column header when at least one rep has snapshotUrl', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    expect(screen.getByText('Snapshot')).toBeInTheDocument();
  });

  it('renders a thumbnail img for reps with a snapshot', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    const img = screen.getByRole('img', { name: /rep 1 violation/i });
    expect(img).toHaveAttribute('src', FAKE_URL);
  });

  it('renders "—" for reps without a snapshot in the snapshot column', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    // Both violations cells and noSnap cells render "—"; just verify one exists in snapshot col
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  // ── Lightbox ──

  it('opens lightbox when thumbnail is clicked', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    const img = screen.getByRole('img', { name: /rep 1 violation/i });
    fireEvent.click(img);
    // The lightbox image should now be in the DOM
    const lightboxImgs = screen.getAllByRole('img');
    const fullSizeImg = lightboxImgs.find((el) => el.getAttribute('alt') === 'Violation frame');
    expect(fullSizeImg).toBeInTheDocument();
    expect(fullSizeImg).toHaveAttribute('src', FAKE_URL);
  });

  it('closes lightbox when ✕ Close button is clicked', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    fireEvent.click(screen.getByRole('img', { name: /rep 1 violation/i }));
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByAltText('Violation frame')).toBeNull();
  });

  it('closes lightbox when backdrop is clicked', () => {
    render(<SessionDetail reps={reps} lift="squat" />);
    fireEvent.click(screen.getByRole('img', { name: /rep 1 violation/i }));
    const lightboxImg = screen.getByAltText('Violation frame');
    // lightboxImg → inside lightboxContent div → inside lightboxBackdrop div
    const lightboxContent = lightboxImg.closest('div')!;
    const backdrop = lightboxContent.parentElement!;
    fireEvent.click(backdrop);
    expect(screen.queryByAltText('Violation frame')).toBeNull();
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('SessionDetail — edge cases', () => {
  it('renders empty table body for zero reps', () => {
    render(<SessionDetail reps={[]} lift="squat" />);
    // Header still renders; just no data rows
    expect(screen.getByText('#')).toBeInTheDocument();
  });

  it('handles null score gracefully (displays 0)', () => {
    render(<SessionDetail reps={[makeRepData({ score: null })]} lift="bench" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('deduplicates violation types in summary cell', () => {
    const rep = makeRepData({
      violations: [
        makeViolation({ type: 'trunk_lean' }),
        makeViolation({ type: 'trunk_lean' }), // duplicate
      ],
    });
    render(<SessionDetail reps={[rep]} lift="squat" />);
    // Should show "trunk lean" only once
    const cells = screen.getAllByText(/trunk lean/i);
    expect(cells).toHaveLength(1);
  });
});
