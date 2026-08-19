"use client";

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Challenge = "left" | "right" | "complete";

type Props = {
  onCapture?: (blob: Blob, dataUrl: string) => void;
  onError?: (error: Error) => void;
  autoStart?: boolean;
};

type FaceMetrics = {
  faceCount: number;
  centerX: number;
  centerY: number;
  faceWidth: number;
  faceHeight: number;
  yaw: number;
  blinkLeft: number;
  blinkRight: number;
};

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Face must occupy at least this much of the camera width/height.
const MIN_FACE_WIDTH = 0.22;
const MIN_FACE_HEIGHT = 0.25;

// Face center tolerance.
const CENTER_TOLERANCE_X = 0.20;
const CENTER_TOLERANCE_Y = 0.22;

// Head turn thresholds.
// These are intentionally moderate because webcam angles vary.
const YAW_LEFT_THRESHOLD = -0.18;
const YAW_RIGHT_THRESHOLD = 0.18;

// Eye & expression thresholds (Spectacle & glare friendly).
const MAX_BLINK_FOR_OPEN = 0.35;
const EYE_WIDE_MAX_THRESHOLD = 0.50;
const REQUIRED_STEADY_FRAMES = 8; // ~400ms at 20fps of steady open-eyed face

// How long the user needs to hold a head direction.
const HEAD_HOLD_MS = 350;

// Minimum time between captures/detections.
const DETECTION_INTERVAL_MS = 50;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Estimate yaw from normalized face landmarks.
 *
 * This is intentionally a simple client-side heuristic.
 * It is useful for a liveness prototype, but is not a
 * cryptographically secure anti-spoofing mechanism.
 */
function estimateYaw(landmarks: any[]) {
  // MediaPipe face landmarks:
  // 1   = nose area
  // 33  = right eye outer
  // 263 = left eye outer
  // 234 = left cheek
  // 454 = right cheek
  //
  // We compare nose position against the eye/face width.

  const nose = landmarks[1];
  const leftEye = landmarks[263];
  const rightEye = landmarks[33];

  if (!nose || !leftEye || !rightEye) {
    return 0;
  }

  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeWidth = Math.abs(leftEye.x - rightEye.x);

  if (eyeWidth < 0.001) {
    return 0;
  }

  return (nose.x - eyeCenterX) / eyeWidth;
}

/**
 * Get blink score from MediaPipe blendshapes.
 *
 * The current MediaPipe Face Landmarker model exposes
 * eyeBlinkLeft and eyeBlinkRight blendshapes.
 */
function getBlendshapeScore(
  result: FaceLandmarkerResult,
  name: string
) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];

  const item = categories.find(
    (category) => category.categoryName === name
  );

  return item?.score ?? 0;
}

export default function AttendanceCamera({
  onCapture,
  onError,
  autoStart = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const lastDetectionRef = useRef(0);

  const leftStartRef = useRef<number | null>(null);
  const rightStartRef = useRef<number | null>(null);

  const leftPassedRef = useRef(false);
  const rightPassedRef = useRef(false);
  const eyesOpenRef = useRef(false);
  const steadyFramesRef = useRef(0);

  const faceCountRef = useRef(0);
  const faceCenteredRef = useRef(false);
  const faceLargeEnoughRef = useRef(false);

  const capturedRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [faceCount, setFaceCount] = useState(0);

  const [faceCentered, setFaceCentered] = useState(false);
  const [faceLargeEnough, setFaceLargeEnough] =
    useState(false);

  const [challenge, setChallenge] =
    useState<Challenge>("left");

  const [leftPassed, setLeftPassed] = useState(false);
  const [rightPassed, setRightPassed] = useState(false);
  const [eyesOpen, setEyesOpen] = useState(false);

  const [capturedUrl, setCapturedUrl] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("Starting camera...");

  /**
   * Stop everything.
   */
  const cleanup = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    }

    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        // Ignore cleanup errors.
      }

      landmarkerRef.current = null;
    }
  }, []);

  /**
   * Capture the current camera frame.
   */
  const captureSelfie = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    if (capturedRef.current) {
      return;
    }

    if (
      faceCountRef.current !== 1 ||
      !faceCenteredRef.current ||
      !faceLargeEnoughRef.current ||
      !leftPassedRef.current ||
      !rightPassedRef.current ||
      !eyesOpenRef.current
    ) {
      return;
    }

    capturedRef.current = true;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      capturedRef.current = false;
      return;
    }

    // Mirror the captured image so it matches the preview.
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          capturedRef.current = false;

          const captureError = new Error(
            "Unable to capture selfie"
          );

          setError(captureError.message);
          onError?.(captureError);
          return;
        }

        const dataUrl = canvas.toDataURL(
          "image/jpeg",
          0.92
        );

        setCapturedUrl(dataUrl);
        setChallenge("complete");
        setMessage("Selfie captured successfully");

        onCapture?.(blob, dataUrl);
      },
      "image/jpeg",
      0.92
    );
  }, [
    onCapture,
    onError,
  ]);

  /**
   * Process one MediaPipe result.
   */
  const processResult = useCallback(
    (result: FaceLandmarkerResult) => {
      if (capturedRef.current) {
        return;
      }

      const faces = result.faceLandmarks ?? [];

      const count = faces.length;

      setFaceCount(count);
      faceCountRef.current = count;

      // --------------------------------------------------
      // 0 / multiple faces
      // --------------------------------------------------

      if (count === 0) {
        setFaceCentered(false);
        setFaceLargeEnough(false);
        faceCenteredRef.current = false;
        faceLargeEnoughRef.current = false;

        leftStartRef.current = null;
        rightStartRef.current = null;

        setMessage("No face detected");

        return;
      }

      if (count > 1) {
        setFaceCentered(false);
        setFaceLargeEnough(false);
        faceCenteredRef.current = false;
        faceLargeEnoughRef.current = false;

        leftStartRef.current = null;
        rightStartRef.current = null;

        setMessage("Only one face is allowed");

        return;
      }

      const landmarks = faces[0];

      // --------------------------------------------------
      // Face bounding box
      // --------------------------------------------------

      let minX = 1;
      let maxX = 0;
      let minY = 1;
      let maxY = 0;

      for (const point of landmarks) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const faceWidth = maxX - minX;
      const faceHeight = maxY - minY;

      const centered =
        Math.abs(centerX - 0.5) <=
          CENTER_TOLERANCE_X &&
        Math.abs(centerY - 0.5) <=
          CENTER_TOLERANCE_Y;

      const largeEnough =
        faceWidth >= MIN_FACE_WIDTH &&
        faceHeight >= MIN_FACE_HEIGHT;

      setFaceCentered(centered);
      setFaceLargeEnough(largeEnough);
      faceCenteredRef.current = centered;
      faceLargeEnoughRef.current = largeEnough;

      // --------------------------------------------------
      // Face positioning must be correct first.
      // --------------------------------------------------

      if (!centered) {
        leftStartRef.current = null;
        rightStartRef.current = null;

        setMessage("Move your face to the center");

        return;
      }

      if (!largeEnough) {
        leftStartRef.current = null;
        rightStartRef.current = null;

        setMessage("Move closer to the camera");

        return;
      }

      // --------------------------------------------------
      // Head pose
      // --------------------------------------------------

      const yaw = estimateYaw(landmarks);

      const now = performance.now();

      // LEFT
      //
      // Because webcam/video coordinates can be mirrored,
      // we intentionally expose this as a challenge rather
      // than assuming the physical left/right direction.
      if (!leftPassedRef.current && !leftPassed) {
        if (yaw < YAW_LEFT_THRESHOLD) {
          if (leftStartRef.current === null) {
            leftStartRef.current = now;
          }

          if (
            now - leftStartRef.current >=
            HEAD_HOLD_MS
          ) {
            leftPassedRef.current = true;
            setLeftPassed(true);
            setChallenge("right");

            leftStartRef.current = null;

            setMessage("Good. Now turn right");
          }
        } else {
          leftStartRef.current = null;
        }

        return;
      }

      // RIGHT
      if (!rightPassedRef.current && !rightPassed) {
        if (yaw > YAW_RIGHT_THRESHOLD) {
          if (rightStartRef.current === null) {
            rightStartRef.current = now;
          }

          if (
            now - rightStartRef.current >=
            HEAD_HOLD_MS
          ) {
            rightPassedRef.current = true;
            setRightPassed(true);

            rightStartRef.current = null;

            setMessage("Good. Now look forward and hold still 🙂");
          }
        } else {
          rightStartRef.current = null;
        }

        return;
      }

      // --------------------------------------------------
      // LOOK FORWARD WITH OPEN EYES & HOLD STEADY
      // --------------------------------------------------
      const blinkLeft = getBlendshapeScore(
        result,
        "eyeBlinkLeft"
      );
      const blinkRight = getBlendshapeScore(
        result,
        "eyeBlinkRight"
      );
      const eyeWideLeft = getBlendshapeScore(
        result,
        "eyeWideLeft"
      );
      const eyeWideRight = getBlendshapeScore(
        result,
        "eyeWideRight"
      );

      const avgBlink = (blinkLeft + blinkRight) / 2;
      const minBlink = Math.min(blinkLeft, blinkRight);

      // Open if average is under threshold, OR if one eye is clearly open when single-lens glare occurs
      const isEyesOpen =
        avgBlink <= MAX_BLINK_FOR_OPEN ||
        (minBlink <= 0.22 && avgBlink <= 0.40);

      const isNotStrained =
        (eyeWideLeft + eyeWideRight) / 2 <= EYE_WIDE_MAX_THRESHOLD;

      setEyesOpen(isEyesOpen);
      eyesOpenRef.current = isEyesOpen;

      if (!isEyesOpen) {
        setMessage("Please look forward (tilt slightly if glasses have glare)");
        return;
      }

      if (!isNotStrained) {
        setMessage("Relax your eyes 🙂");
        return;
      }

      setChallenge("complete");
      setMessage("✓ All checks passed! Click 'Capture Selfie' below");
    },
    []
  );

  /**
   * Detection loop.
   */
  const detectLoop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (
      !video ||
      !landmarker ||
      video.readyState < 2
    ) {
      animationRef.current =
        requestAnimationFrame(detectLoop);

      return;
    }

    const now = performance.now();

    if (
      now - lastDetectionRef.current >=
      DETECTION_INTERVAL_MS
    ) {
      lastDetectionRef.current = now;

      try {
        const result =
          landmarker.detectForVideo(
            video,
            now
          );

        processResult(result);
      } catch (err) {
        console.error(
          "Face detection error:",
          err
        );
      }
    }

    animationRef.current =
      requestAnimationFrame(detectLoop);
  }, [processResult]);

  /**
   * Initialize MediaPipe + camera.
   */
  const initialize = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMessage("Loading face detector...");

      const vision =
        await FilesetResolver.forVisionTasks(
          WASM_URL
        );

      const landmarker =
        await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: MODEL_URL,
            },

            runningMode: "VIDEO",

            // We need to know if there are multiple faces,
            // so do NOT set this to 1.
            numFaces: 3,

            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,

            // Needed for blink detection.
            outputFaceBlendshapes: true,

            outputFacialTransformationMatrixes: false,
          }
        );

      landmarkerRef.current = landmarker;

      setMessage("Requesting camera...");

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",

            width: {
              ideal: 1280,
            },

            height: {
              ideal: 720,
            },

            frameRate: {
              ideal: 30,
              max: 30,
            },
          },

          audio: false,
        });

      streamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        throw new Error(
          "Camera video element is unavailable"
        );
      }

      video.srcObject = stream;

      await video.play();

      setCameraReady(true);
      setLoading(false);

      setMessage("Position your face in the oval");

      animationRef.current =
        requestAnimationFrame(detectLoop);
    } catch (err) {
      console.error(err);

      const normalizedError =
        err instanceof Error
          ? err
          : new Error(
              "Unable to initialize camera"
            );

      setError(normalizedError.message);
      setLoading(false);
      setCameraReady(false);

      onError?.(normalizedError);
    }
  }, [detectLoop, onError]);

  /**
   * Initialize once.
   */
  useEffect(() => {
    if (!autoStart) {
      setLoading(false);
      return;
    }

    initialize();

    return () => {
      cleanup();
    };
  }, [
    autoStart,
    initialize,
    cleanup,
  ]);

  /**
   * Restart.
   */
  const restart = useCallback(() => {
    cleanup();

    capturedRef.current = false;

    leftStartRef.current = null;
    rightStartRef.current = null;

    leftPassedRef.current = false;
    rightPassedRef.current = false;
    eyesOpenRef.current = false;
    steadyFramesRef.current = 0;

    faceCountRef.current = 0;
    faceCenteredRef.current = false;
    faceLargeEnoughRef.current = false;

    setFaceCount(0);
    setFaceCentered(false);
    setFaceLargeEnough(false);

    setLeftPassed(false);
    setRightPassed(false);
    setEyesOpen(false);

    setCapturedUrl(null);
    setChallenge("left");
    setCameraReady(false);

    initialize();
  }, [cleanup, initialize]);

  const allChecksPassed =
    faceCount === 1 &&
    faceCentered &&
    faceLargeEnough &&
    leftPassed &&
    rightPassed &&
    eyesOpen;

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Camera */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
          style={{
            transform: "scaleX(-1)",
          }}
        />

        {/* Center guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={[
              "h-[65%] w-[62%] rounded-[50%] border-4",
              faceCount === 1 &&
              faceCentered &&
              faceLargeEnough
                ? "border-green-400"
                : "border-white/80",
            ].join(" ")}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <div className="text-center">
              <div className="mb-2 text-lg font-semibold">
                Loading...
              </div>

              <div className="text-sm opacity-80">
                {message}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl bg-red-600/90 p-4 text-sm text-white">
            {error}
          </div>
        )}

        {/* Success */}
        {capturedUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="rounded-full bg-green-500 px-5 py-3 font-semibold text-white">
              ✓ Selfie captured
            </div>
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Status */}
      <div className="rounded-xl border p-4">
        <div className="mb-3 text-center font-medium">
          {message}
        </div>

        {/* Face status */}
        <div className="space-y-2 text-sm">
          <StatusRow
            label="Exactly one face"
            passed={faceCount === 1}
          />

          <StatusRow
            label="Face centered"
            passed={faceCentered}
          />

          <StatusRow
            label="Face close enough"
            passed={faceLargeEnough}
          />

          <StatusRow
            label="Turn left"
            passed={leftPassed}
          />

          <StatusRow
            label="Turn right"
            passed={rightPassed}
          />

          <StatusRow
            label="Eyes open & looking forward"
            passed={eyesOpen}
          />
        </div>
      </div>

      {/* Current challenge */}
      {!capturedUrl && cameraReady && (
        <div className="rounded-xl bg-gray-100 p-4 text-center">
          {challenge === "left" && (
            <>
              <div className="text-lg font-semibold">
                Turn your head left
              </div>

              <div className="text-sm text-gray-600">
                Hold for a moment
              </div>
            </>
          )}

          {challenge === "right" && (
            <>
              <div className="text-lg font-semibold">
                Turn your head right
              </div>

              <div className="text-sm text-gray-600">
                Hold for a moment
              </div>
            </>
          )}

          {challenge === "complete" && (
            <div className="text-lg font-semibold text-green-600">
              ✓ Liveness check complete
            </div>
          )}
        </div>
      )}

      {/* Capture button */}
      <button
        type="button"
        disabled={!allChecksPassed || !!capturedUrl}
        onClick={captureSelfie}
        className="w-full rounded-xl bg-black px-5 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {capturedUrl
          ? "Selfie Captured"
          : allChecksPassed
            ? "Capture Selfie"
            : "Complete Verification"}
      </button>

      {/* Restart */}
      {(capturedUrl || error) && (
        <button
          type="button"
          onClick={restart}
          className="w-full rounded-xl border px-5 py-3 font-medium"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

function StatusRow({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>

      <span
        className={
          passed
            ? "font-semibold text-green-600"
            : "text-gray-400"
        }
      >
        {passed ? "✓" : "○"}
      </span>
    </div>
  );
}
