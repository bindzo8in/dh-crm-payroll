"use client";

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

import {
  CameraIcon,
  CheckCircleIcon,
  Loader2,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type SelfieData = {
  url: string;
  publicId: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (data: SelfieData) => void;
  handleClockIn: (data: SelfieData) => Promise<void>;
};

type Challenge =
  | "position"
  | "complete";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/* =========================================================
   CONFIG
========================================================= */

/*
 * Initial face positioning.
 */
const MIN_FACE_WIDTH = 0.20;
const MIN_FACE_HEIGHT = 0.23;

const CENTER_TOLERANCE_X = 0.20;
const CENTER_TOLERANCE_Y = 0.22;

/*
 * Eye & expression thresholds (Spectacle & glare friendly).
 * - MAX_BLINK_FOR_OPEN: 0.35 accommodates glasses reflections & frame contours while catching closed eyes (>= 0.50).
 * - EYE_WIDE_MAX_THRESHOLD: 0.50 avoids false warnings from frame rim distortion.
 */
const MAX_BLINK_FOR_OPEN = 0.35;
const EYE_WIDE_MAX_THRESHOLD = 0.50;

/*
 * MediaPipe detection interval.
 *
 * Approximately 20 FPS.
 */
const DETECTION_INTERVAL_MS = 50;

/* =========================================================
   HEAD TURN
========================================================= */

/**
 * Estimate horizontal head movement.
 *
 * We compare the nose against the two cheek landmarks.
 *
 * IMPORTANT:
 * Camera preview is mirrored, but MediaPipe landmark
 * coordinates are NOT simply mirrored by CSS.
 *
 * We therefore treat the two directions as "screen left"
 * and "screen right" and show the appropriate instruction.
 */
function estimateHeadTurn(landmarks: any[]): number {
  const nose = landmarks[1];

  const cheekLeft = landmarks[234];
  const cheekRight = landmarks[454];

  if (!nose || !cheekLeft || !cheekRight) {
    return 0;
  }

  const faceWidth = Math.abs(
    cheekRight.x - cheekLeft.x
  );

  if (faceWidth < 0.05) {
    return 0;
  }

  const faceCenter =
    (cheekLeft.x + cheekRight.x) / 2;

  /*
   * Normalize nose displacement by face width.
   */
  return (
    (nose.x - faceCenter) /
    faceWidth
  );
}

/* =========================================================
   BLENDSHAPE
========================================================= */

function getBlendshapeScore(
  result: FaceLandmarkerResult,
  name: string
) {
  const categories =
    result.faceBlendshapes?.[0]?.categories ?? [];

  return (
    categories.find(
      (category) =>
        category.categoryName === name
    )?.score ?? 0
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export function SelfieCameraModal({
  isOpen,
  onClose,
  onCapture,
  handleClockIn,
}: Props) {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const landmarkerRef =
    useRef<FaceLandmarker | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const animationRef =
    useRef<number | null>(null);

  const lastDetectionTimeRef =
    useRef(0);

  /*
   * IMPORTANT:
   *
   * Liveness state is stored in refs so that the
   * detection loop does NOT get recreated whenever
   * React state changes.
   */
  const challengeRef =
    useRef<Challenge>("position");

  const leftPassedRef =
    useRef(false);

  const faceCountRef =
    useRef(0);

  const faceCenteredRef =
    useRef(false);

  const faceLargeEnoughRef =
    useRef(false);

  const eyesOpenRef =
    useRef(false);

  const steadyFramesRef =
    useRef(0);

  const capturedRef =
    useRef(false);

  const captureTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  /*
   * Keep parent callbacks in refs.
   *
   * This prevents the camera effect from restarting
   * when PunchClockView re-renders.
   */
  const onCaptureRef =
    useRef(onCapture);

  const handleClockInRef =
    useRef(handleClockIn);

  useEffect(() => {
    onCaptureRef.current =
      onCapture;
  }, [onCapture]);

  useEffect(() => {
    handleClockInRef.current =
      handleClockIn;
  }, [handleClockIn]);

  /* =======================================================
     UI STATE
  ======================================================= */

  const [loading, setLoading] =
    useState(false);

  const [processing, setProcessing] =
    useState(false);

  const [message, setMessage] =
    useState(
      "Position your face in the oval"
    );

  const [faceCount, setFaceCount] =
    useState(0);

  const [faceCentered, setFaceCentered] =
    useState(false);

  const [faceLargeEnough, setFaceLargeEnough] =
    useState(false);

  const [eyesOpen, setEyesOpen] =
    useState(false);

  const [challenge, setChallenge] =
    useState<Challenge>("position");

  // const [headTurnValue, setHeadTurnValue] =
  //   useState(0);

  /* =======================================================
     SET CHALLENGE
  ======================================================= */

  const updateChallenge = useCallback(
    (next: Challenge) => {
      challengeRef.current =
        next;

      setChallenge(next);
    },
    []
  );

  /* =======================================================
     CLEANUP
  ======================================================= */

  const cleanup = useCallback(() => {
    /*
     * Cancel animation frame.
     */
    if (
      animationRef.current !== null
    ) {
      cancelAnimationFrame(
        animationRef.current
      );

      animationRef.current =
        null;
    }

    /*
     * Cancel pending capture.
     */
    if (
      captureTimeoutRef.current !==
      null
    ) {
      clearTimeout(
        captureTimeoutRef.current
      );

      captureTimeoutRef.current =
        null;
    }

    /*
     * Stop camera.
     */
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current =
        null;
    }

    /*
     * Close MediaPipe.
     */
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        // ignore
      }

      landmarkerRef.current =
        null;
    }
  }, []);

  /* =======================================================
     UPLOAD
  ======================================================= */

  const uploadSelfie = useCallback(
    async (
      blob: Blob
    ): Promise<SelfieData> => {
      const cloudinaryUrl =
        `https://api.cloudinary.com/v1_1/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;
      const formData = new FormData();

      formData.append(
        "file",
        blob,
        "attendance-selfie.jpg"
      );
      formData.append(
        "upload_preset",
        env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
      );

      const response = await fetch(
        cloudinaryUrl,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(
          `Selfie upload failed with status: ${response.status}`
        );
      }

      const data: unknown = await response.json();

      if (
        typeof data !== "object" ||
        data === null ||
        !("secure_url" in data) ||
        typeof data.secure_url !== "string" ||
        !("public_id" in data) ||
        typeof data.public_id !== "string"
      ) {
        throw new Error(
          "Cloudinary returned an invalid upload response"
        );
      }

      return {
        url: data.secure_url,
        publicId: data.public_id,
      };
    },
    []
  );

  /* =======================================================
     CAPTURE SELFIE
  ======================================================= */

  const captureSelfie =
    useCallback(async () => {
      if (capturedRef.current) {
        return;
      }

      const video =
        videoRef.current;

      const canvas =
        canvasRef.current;

      if (!video || !canvas) {
        return;
      }

      /*
       * Final validation.
       *
       * Use refs, NOT React state.
       */
      if (
        faceCountRef.current !== 1 ||
        !faceCenteredRef.current ||
        !faceLargeEnoughRef.current ||
        !eyesOpenRef.current
      ) {
        return;
      }

      capturedRef.current =
        true;

      setProcessing(true);
      setMessage(
        "Capturing selfie..."
      );

      console.log("📸 Starting selfie capture...");

      canvas.width =
        video.videoWidth;

      canvas.height =
        video.videoHeight;

      const context =
        canvas.getContext("2d");

      if (!context) {
        console.error("❌ Failed to get canvas context");
        capturedRef.current =
          false;

        setProcessing(false);

        setMessage(
          "Unable to capture selfie"
        );

        return;
      }

      /*
       * Mirror image to match preview.
       */
      context.save();

      context.translate(
        canvas.width,
        0
      );

      context.scale(-1, 1);

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      context.restore();

      console.log("✓ Canvas image drawn");

      const blob =
        await new Promise<Blob | null>(
          (resolve) => {
            canvas.toBlob(
              (blob) => {
                console.log("✓ Blob created:", blob?.size);
                resolve(blob);
              },
              "image/jpeg",
              0.92
            );
          }
        );

      if (!blob) {
        console.error("❌ Failed to create blob");
        capturedRef.current =
          false;

        setProcessing(false);

        setMessage(
          "Unable to capture selfie"
        );

        return;
      }

      try {
        console.log("📤 Uploading selfie...");
        setMessage(
          "Uploading selfie..."
        );

        const selfieData =
          await uploadSelfie(blob);

        console.log("✓ Selfie uploaded:", selfieData);

        /*
         * Send selfie to parent.
         */
        onCaptureRef.current(
          selfieData
        );

        updateChallenge(
          "complete"
        );

        setMessage(
          "✓ Verification complete — Clocking in..."
        );

        /*
         * Automatically clock in.
         */
        try {
          console.log("🔐 Calling handleClockIn...");
          await handleClockInRef.current(
            selfieData
          );
          console.log("✓ Clock-in successful");
          
          /*
           * Close modal after successful clock-in.
           */
          setTimeout(() => {
            setProcessing(false);
            cleanup();
            onClose();
          }, 500);
          
          return;
        } catch (clockInError) {
          console.error(
            "❌ Clock-in failed after selfie capture:",
            clockInError
          );
          
          setMessage(
            clockInError instanceof Error
              ? `Clock-in error: ${clockInError.message}`
              : "Clock-in failed after capture"
          );
          
          setProcessing(false);
          return;
        }
      } catch (error) {
        console.error(
          "Selfie capture/upload failed:",
          error
        );

        capturedRef.current =
          false;

        setProcessing(false);

        setMessage(
          error instanceof Error
            ? error.message
            : "Selfie upload failed"
        );
      }
    }, [
      uploadSelfie,
      updateChallenge,
    ]);

  /* =======================================================
     PROCESS MEDIAPIPE RESULT
  ======================================================= */

  const processResult = useCallback(
    (result: FaceLandmarkerResult) => {
      if (capturedRef.current) return;

      const faces = result.faceLandmarks ?? [];
      const count = faces.length;

      setFaceCount(count);
      faceCountRef.current = count;

      // -----------------------------
      // EXACTLY ONE FACE
      // -----------------------------
      if (count === 0) {
        setFaceCentered(false);
        setFaceLargeEnough(false);
        setEyesOpen(false);
        faceCenteredRef.current = false;
        faceLargeEnoughRef.current = false;
        eyesOpenRef.current = false;
        steadyFramesRef.current = 0;

        setMessage("No face detected");
        return;
      }

      if (count > 1) {
        setFaceCentered(false);
        setFaceLargeEnough(false);
        setEyesOpen(false);
        faceCenteredRef.current = false;
        faceLargeEnoughRef.current = false;
        eyesOpenRef.current = false;
        steadyFramesRef.current = 0;

        setMessage("Only one face is allowed");
        return;
      }

      const landmarks = faces[0];

      // -----------------------------
      // FACE SIZE / POSITION
      // -----------------------------
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
        Math.abs(centerX - 0.5) <= CENTER_TOLERANCE_X &&
        Math.abs(centerY - 0.5) <= CENTER_TOLERANCE_Y;

      const largeEnough =
        faceWidth >= MIN_FACE_WIDTH &&
        faceHeight >= MIN_FACE_HEIGHT;

      setFaceCentered(centered);
      setFaceLargeEnough(largeEnough);
      faceCenteredRef.current = centered;
      faceLargeEnoughRef.current = largeEnough;

      if (!centered) {
        setEyesOpen(false);
        eyesOpenRef.current = false;
        setMessage("Move your face to the center");
        return;
      }

      if (!largeEnough) {
        setEyesOpen(false);
        eyesOpenRef.current = false;
        setMessage("Move closer to the camera");
        return;
      }

      // -----------------------------
      // EYES OPEN & NATURAL POSE (Glasses & glare tolerant)
      // -----------------------------
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
        setMessage("Keep eyes open (tilt head if glasses have glare)");
        return;
      }

      if (!isNotStrained) {
        setMessage("Relax your face 🙂");
        return;
      }

      setMessage("✓ Ready! Click 'Capture & Clock In'");
    },
    []
  );

  /* =======================================================
     DETECTION LOOP
  ======================================================= */

  const detectLoopRef =
    useRef<() => void>(() => { });

  /*
   * Store latest processResult.
   */
  const processResultRef =
    useRef(processResult);

  useEffect(() => {
    processResultRef.current =
      processResult;
  }, [processResult]);

  /*
   * Detection loop is intentionally stable.
   */
  useEffect(() => {
    detectLoopRef.current =
      () => {
        const video =
          videoRef.current;

        const landmarker =
          landmarkerRef.current;

        if (
          !video ||
          !landmarker ||
          video.readyState <
          HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.videoWidth === 0 ||
          video.videoHeight === 0
        ) {
          animationRef.current =
            requestAnimationFrame(
              () =>
                detectLoopRef.current()
            );

          return;
        }

        const now =
          performance.now();

        /*
         * Throttle detection.
         */
        if (
          now -
          lastDetectionTimeRef.current <
          DETECTION_INTERVAL_MS
        ) {
          animationRef.current =
            requestAnimationFrame(
              () =>
                detectLoopRef.current()
            );

          return;
        }

        lastDetectionTimeRef.current =
          now;

        try {
          const result =
            landmarker.detectForVideo(
              video,
              now
            );

          processResultRef.current(
            result
          );
        } catch (error) {
          console.error(
            "MediaPipe detectForVideo failed:",
            error
          );
        }

        animationRef.current =
          requestAnimationFrame(
            () =>
              detectLoopRef.current()
          );
      };
  }, []);

  /* =======================================================
     CAMERA INITIALIZATION
     
     CRITICAL:
     
     This effect MUST NOT depend on detectLoop,
     processResult, challenge, leftPassed, etc.
  ======================================================= */

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      return;
    }

    let cancelled =
      false;

    async function start() {
      try {
        setLoading(true);
        setProcessing(false);

        /*
         * Reset refs.
         */
        challengeRef.current =
          "position";

        faceCountRef.current =
          0;

        faceCenteredRef.current =
          false;

        faceLargeEnoughRef.current =
          false;

        eyesOpenRef.current =
          false;

        steadyFramesRef.current =
          0;

        capturedRef.current =
          false;

        lastDetectionTimeRef.current =
          0;

        /*
         * Reset UI.
         */
        setChallenge(
          "position"
        );

        setFaceCount(0);
        setFaceCentered(false);
        setFaceLargeEnough(false);
        setEyesOpen(false);

        setMessage(
          "Loading face detector..."
        );

        /* -----------------------------------------------
           MediaPipe
        ------------------------------------------------ */

        const vision =
          await FilesetResolver.forVisionTasks(
            WASM_URL
          );

        if (cancelled) {
          return;
        }

        const landmarker =
          await FaceLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  MODEL_URL,
              },

              runningMode: "VIDEO",

              /*
               * More than one so we can reject
               * multiple people.
               */
              numFaces: 3,

              minFaceDetectionConfidence:
                0.5,

              minFacePresenceConfidence:
                0.5,

              minTrackingConfidence:
                0.5,

              outputFaceBlendshapes:
                true,

              outputFacialTransformationMatrixes:
                false,
            }
          );

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current =
          landmarker;

        /* -----------------------------------------------
           Camera
        ------------------------------------------------ */

        setMessage(
          "Requesting camera..."
        );

        if (
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error(
            "Camera access is not supported by this browser."
          );
        }

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: {
                facingMode: {
                  ideal: "user",
                },

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
            }
          );

        if (cancelled) {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop()
            );

          return;
        }

        streamRef.current =
          stream;

        const video =
          videoRef.current;

        if (!video) {
          throw new Error(
            "Camera video element unavailable."
          );
        }

        video.srcObject =
          stream;

        /*
         * Wait until video has dimensions.
         */
        await new Promise<void>(
          (resolve) => {
            if (
              video.readyState >=
              HTMLMediaElement.HAVE_METADATA &&
              video.videoWidth > 0
            ) {
              resolve();
              return;
            }

            const onLoadedMetadata =
              () => {
                video.removeEventListener(
                  "loadedmetadata",
                  onLoadedMetadata
                );

                resolve();
              };

            video.addEventListener(
              "loadedmetadata",
              onLoadedMetadata
            );
          }
        );

        await video.play();

        if (cancelled) {
          return;
        }

        setLoading(false);

        setMessage(
          "Position your face in the oval"
        );

        /*
         * Start ONLY ONCE.
         */
        animationRef.current =
          requestAnimationFrame(
            () =>
              detectLoopRef.current()
          );
      } catch (error) {
        console.error(
          "Camera initialization failed:",
          error
        );

        if (
          cancelled
        ) {
          return;
        }

        setLoading(false);

        let errorMessage =
          "Unable to start camera.";

        if (
          error instanceof DOMException
        ) {
          if (
            error.name ===
            "NotAllowedError"
          ) {
            errorMessage =
              "Camera permission was denied. Please allow camera access.";
          } else if (
            error.name ===
            "NotFoundError"
          ) {
            errorMessage =
              "No camera was found on this device.";
          } else if (
            error.name ===
            "NotReadableError"
          ) {
            errorMessage =
              "Camera is already being used by another application.";
          }
        } else if (
          error instanceof Error
        ) {
          errorMessage =
            error.message;
        }

        setMessage(
          errorMessage
        );
      }
    }

    start();

    /*
     * IMPORTANT:
     *
     * Only isOpen controls camera initialization.
     */
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    isOpen,
    cleanup,
  ]);

  /* =======================================================
     CLOSE
  ======================================================= */

  const close = () => {
    if (processing) {
      return;
    }

    cleanup();

    onClose();
  };

  const allChecksPassed =
    faceCount === 1 &&
    faceCentered &&
    faceLargeEnough &&
    eyesOpen;

  if (!isOpen) {
    return null;
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-4 overflow-y-auto">
      <div className="relative flex max-h-[92dvh] sm:max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-background shadow-2xl my-auto">

        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:p-4">
          <div>
            <h2 className="text-sm font-bold sm:text-base">
              Live Selfie Verification
            </h2>

            <p className="text-[11px] text-muted-foreground sm:text-xs">
              Complete verification to clock in
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            disabled={processing}
            className="rounded-full p-1.5 hover:bg-muted disabled:opacity-50"
          >
            <XIcon className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* CAMERA PREVIEW */}
        <div className="relative aspect-[4/3] sm:aspect-[3/4] max-h-[35vh] sm:max-h-[42vh] w-full shrink-0 bg-black overflow-hidden">

          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{
              transform:
                "scaleX(-1)",
            }}
          />

          {/* FACE GUIDE */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={[
                "h-[75%] w-[58%] rounded-[50%] border-4 transition-colors duration-200",

                faceCount === 1 &&
                  faceCentered &&
                  faceLargeEnough
                  ? "border-green-400"
                  : faceCount > 1
                    ? "border-red-400"
                    : "border-white/80",
              ].join(" ")}
            />
          </div>

          {/* PROCESSING */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center text-white">
                <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
                <p className="text-xs sm:text-sm">
                  {message}
                </p>
              </div>
            </div>
          )}

          {/* PROCESSING CAPTURE */}
          {processing && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="rounded-2xl bg-black/70 px-4 py-3 text-center text-white">
                <Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin" />
                <p className="text-xs sm:text-sm">
                  {message}
                </p>
              </div>
            </div>
          )}
        </div>

        <canvas
          ref={canvasRef}
          className="hidden"
        />

        {/* CONTENT & CONTROLS */}
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3.5 sm:p-5 space-y-2.5">

          {/* STATUS */}
          <div className="rounded-xl bg-muted/70 p-2.5 text-center sm:p-3">
            <p className="text-xs font-semibold sm:text-sm">
              {message}
            </p>
          </div>

          {/* CHECKLIST (2x2 Compact Grid) */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <CheckRow
              label="Single face"
              passed={faceCount === 1}
            />

            <CheckRow
              label="Centered"
              passed={faceCentered}
            />

            <CheckRow
              label="Good distance"
              passed={faceLargeEnough}
            />

            <CheckRow
              label="Eyes open"
              passed={eyesOpen}
            />
          </div>

          {/* CAPTURE BUTTON */}
          <div className="pt-1 shrink-0">
            <button
              type="button"
              disabled={!allChecksPassed || processing}
              onClick={captureSelfie}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white shadow-md transition-all text-xs sm:text-sm",
                allChecksPassed && !processing
                  ? "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] shadow-emerald-500/25 cursor-pointer"
                  : "bg-muted-foreground/20 cursor-not-allowed text-muted-foreground shadow-none"
              )}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Clocking in...</span>
                </>
              ) : (
                <>
                  <CameraIcon className="h-4 w-4" />
                  <span>
                    {allChecksPassed
                      ? "Capture & Clock In"
                      : "Position Face to Enable Capture"}
                  </span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CHECK ROW
========================================================= */

function CheckRow({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background/50 px-2.5 py-1.5">
      <span className="truncate pr-1 text-[11px] sm:text-xs text-muted-foreground font-medium">
        {label}
      </span>

      {passed ? (
        <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
      )}
    </div>
  );
}