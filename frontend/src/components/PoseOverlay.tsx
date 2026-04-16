import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Landmark, LiftType } from '../types';
import { drawSkeleton, drawAngleLabel } from '../lib/renderer';
import styles from './PoseOverlay.module.css';

export interface PoseOverlayHandle {
  draw: (landmarks: Landmark[], primaryAngle: number, lift: LiftType) => void;
  clear: () => void;
}

interface Props {
  /** Container element whose dimensions the canvas should match */
  containerRef: React.RefObject<HTMLElement | null>;
}

export const PoseOverlay = forwardRef<PoseOverlayHandle, Props>(function PoseOverlay(
  { containerRef },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resize canvas whenever container resizes
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  useImperativeHandle(ref, () => ({
    draw(landmarks: Landmark[], primaryAngle: number, lift: LiftType) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drawSkeleton(canvas, landmarks);
      drawAngleLabel(canvas, landmarks, primaryAngle, lift);
    },
    clear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    },
  }));

  return <canvas ref={canvasRef} className={styles.canvas} />;
});
