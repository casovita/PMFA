import { useRef, useCallback, useState } from 'react';
import styles from './VideoCapture.module.css';

interface Props {
  /** Called when a video file is loaded and ready to play. The File is passed
   *  so the caller can submit it to the backend for server-side analysis. */
  onVideoReady: (video: HTMLVideoElement, file: File) => void;
  onWebcamReady: (video: HTMLVideoElement) => void;
  onStop: () => void;
  onError?: (msg: string) => void;
  mode: 'idle' | 'video' | 'webcam';
}

export function VideoCapture({ onVideoReady, onWebcamReady, onStop, onError, mode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !videoRef.current) return;
      const video = videoRef.current;

      // Revoke previous blob URL to avoid memory leaks
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }

      setIsLoading(true);
      video.srcObject = null;
      const url = URL.createObjectURL(file);
      blobUrlRef.current = url;
      video.src = url;

      video.onerror = () => {
        setIsLoading(false);
        onError?.('Could not load video — unsupported format or corrupted file.');
      };

      video.onloadedmetadata = () => {
        setIsLoading(false);
        onVideoReady(video, file);
      };

      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [onVideoReady, onError],
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
      const friendly = msg.includes('NotAllowed') || msg.includes('Permission')
        ? 'Camera access denied. Enable camera permission in your browser settings and try again.'
        : msg.includes('NotFound') || msg.includes('DevicesNotFound')
        ? 'No camera found. Connect a camera and try again.'
        : 'Could not start camera. Please try again.';
      onError?.(friendly);
    }
  }, [onWebcamReady, onError]);

  const handleStop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setIsLoading(false);
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
        {isLoading && (
          <div className={styles.loadingOverlay}>
            Loading video…
          </div>
        )}
      </div>

      {mode !== 'idle' && (
        <div className={styles.controls}>
          {mode === 'webcam' && (
            <button className={styles.stopBtn} onClick={handleStop}>
              Stop Camera
            </button>
          )}
          {mode === 'video' && (
            <button className={styles.stopBtn} onClick={handleStop}>
              Stop &amp; Save
            </button>
          )}
        </div>
      )}
    </div>
  );
}
