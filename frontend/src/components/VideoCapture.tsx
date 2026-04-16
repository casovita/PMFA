import { useRef, useCallback } from 'react';
import styles from './VideoCapture.module.css';

interface Props {
  onVideoReady: (video: HTMLVideoElement) => void;
  onWebcamReady: (video: HTMLVideoElement) => void;
  onStop: () => void;
  mode: 'idle' | 'video' | 'webcam';
}

export function VideoCapture({ onVideoReady, onWebcamReady, onStop, mode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !videoRef.current) return;
      const video = videoRef.current;
      video.srcObject = null;
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => onVideoReady(video);
    },
    [onVideoReady],
  );

  const handleWebcam = useCallback(async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      video.src = '';
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      await video.play();
      onWebcamReady(video);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Camera error: ${msg}`);
    }
  }, [onWebcamReady]);

  const handleStop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
    onStop();
  }, [onStop]);

  return (
    <div className={styles.root}>
      {mode === 'idle' && (
        <div className={styles.picker}>
          <label className={styles.sourceBtn}>
            Upload Video
            <input type="file" accept="video/*" onChange={handleFileChange} />
          </label>
          <button className={styles.sourceBtn} onClick={() => void handleWebcam()}>
            Open Webcam
          </button>
        </div>
      )}

      <div className={styles.videoContainer} data-visible={mode !== 'idle' ? 'true' : undefined}>
        <video ref={videoRef} className={styles.video} playsInline muted controls={mode === 'video'} />
        {mode === 'webcam' && <span className={styles.liveBadge}>LIVE</span>}
      </div>

      {mode !== 'idle' && (
        <div className={styles.controls}>
          {mode === 'webcam' && (
            <button className={styles.stopBtn} onClick={handleStop}>
              Stop Camera
            </button>
          )}
        </div>
      )}
    </div>
  );
}
