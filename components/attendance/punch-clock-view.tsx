"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkMode } from "@/app/generated/prisma/enums";
// import { SelfieCameraModal } from "./selfie-camera-modal";
import {
  clockInAction,
  clockOutAction,
  startBreakAction,
  endBreakAction,
} from "@/actions/attendance";
import {
  ClockIcon,
  MapPinIcon,
  LaptopIcon,
  Building2Icon,
  HomeIcon,
  CoffeeIcon,
  PlayIcon,
  LogOutIcon,
  CameraIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";

// type SelfieData = {
//   url: string;
//   publicId: string;
// };
interface PunchClockViewProps {
  initialRecord: any;
  settings: any;
  onRefresh: () => void;
  workMode: WorkMode;
}

export function PunchClockView({ initialRecord, settings, onRefresh, workMode }: PunchClockViewProps) {
  // const [time, setTime] = useState<Date | null>(null);
  // const [selectedWorkMode, setSelectedWorkMode] = useState<WorkMode>(
  //   initialRecord?.workMode || WorkMode.OFFICE
  // );
  const actionLock = useRef(false);
  // const [isCameraOpen, setIsCameraOpen] = useState(false);
  // const [selfie, setSelfie] = useState<{ url: string; publicId: string } | null>(
  //   initialRecord?.selfieUrl
  //     ? { url: initialRecord.selfieUrl, publicId: initialRecord.selfiePublicId || "" }
  //     : null
  // );
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: initialRecord?.latitude || null,
    lng: initialRecord?.longitude || null,
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // // Live Digital Clock
  // useEffect(() => {
  //   setTime(new Date());
  //   const timer = setInterval(() => {
  //     setTime(new Date());
  //   }, 1000);
  //   return () => clearInterval(timer);
  // }, []);

  const fetchLocation = () => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      setIsLocating(true);
      setLocationError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setIsLocating(false);
        },
        (err) => {
          console.log("Geolocation error:", err.message);
          let errorMessage = "Unable to get location.";
          if (err.code === err.PERMISSION_DENIED) {
            errorMessage = "Location access denied. Please enable it in browser settings.";
            toast.error("Location permission denied. Please enable it in your browser/device settings and try again.");
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMessage = "Location information is unavailable.";
            toast.error("Location unavailable. Make sure your device GPS is turned on.");
          } else if (err.code === err.TIMEOUT) {
            errorMessage = "Location request timed out.";
            toast.error("Location request timed out. Please try again.");
          }
          setLocationError(errorMessage);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError("Geolocation is not supported by this browser.");
    }
  };

  // Request browser geolocation on mount if not available
  useEffect(() => {
    if (!coords.lat && !locationError && !isLocating) {
      fetchLocation();
    }
  }, [coords.lat]);

  const activeRecord = initialRecord;
  const isClockedIn = !!activeRecord && !activeRecord.clockOut;
  const openBreak = activeRecord?.breaks?.find((b: any) => !b.breakEnd);
  const isOnBreak = !!openBreak;

  const acquireActionLock = () => {
  if (actionLock.current) return false;

  actionLock.current = true;
  return true;
};

const releaseActionLock = () => {
  actionLock.current = false;
};



const handleClockIn = async () => {
  if (loading || !acquireActionLock()) return;

  // const selfieToUse = capturedSelfie ?? selfie;

  // if (!selfieToUse?.url) {
  //   releaseActionLock();
  //   setIsCameraOpen(true);
  //   toast.info("Please capture a live selfie to complete clock-in.");
  //   return;
  // }

  setLoading(true);

  try {
    const res = await clockInAction({
      workMode,
      latitude: coords.lat,
      longitude: coords.lng,
      // selfieUrl: selfieToUse.url,
      // selfiePublicId: selfieToUse.publicId,
      notes: notes || undefined,
    });

    if (!res.success) {
      toast.error(res.error || "Failed to clock in");
      return;
    }

    toast.success("Clocked in successfully!");
    onRefresh();
  } catch (err: any) {
    toast.error(err.message || "Failed to clock in");
  } finally {
    setLoading(false);
    releaseActionLock();
  }
};

  const handleClockOut = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const res = await clockOutAction({
        notes: notes || undefined,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to clock out");
        return;
      }

      toast.success("Clocked out successfully!");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to clock out");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBreak = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isOnBreak) {
        const res = await endBreakAction({ breakId: openBreak.id });
        if (!res.success) {
          toast.error(res.error || "Failed to end break");
          return;
        }
        toast.success("Resumed work from break!");
      } else {
        const res = await startBreakAction({ type: "LUNCH" });
        if (!res.success) {
          toast.error(res.error || "Failed to start break");
          return;
        }
        toast.success("Started break session.");
      }
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update break status");
    } finally {
      setLoading(false);
    }
  };

  // Formatted date string
  const formattedDate =
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const railwayTo12 = (time24: string) => {
      return format(parse(time24, "HH:mm", new Date()), 'h:mm a');
    };

  // const formattedTime = time
  //   ? time.toLocaleTimeString("en-US", {
  //       hour: "2-digit",
  //       minute: "2-digit",
  //       second: "2-digit",
  //       hour12: true,
  //     })
  //   : "00:00:00 AM";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-24 md:pb-6">
      {/* Header Banner */}
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-primary/10 via-background to-background shadow-xl rounded-3xl">
        <div className="absolute -right-10 -top-10 w-44 h-44 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
              <SparklesIcon className="w-3.5 h-3.5" /> Attendance Kiosk Mode
            </div>
            {/* <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              {formattedTime}
            </h1> */}
            <p className="text-muted-foreground text-sm font-medium">{formattedDate}</p>
          </div>

          <div className="flex flex-col items-center md:items-end gap-2">
            <div className="flex items-center gap-2">
              {isClockedIn ? (
                isOnBreak ? (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                    <CoffeeIcon className="w-3.5 h-3.5" /> On Break
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5" /> Active Shift
                  </Badge>
                )
              ) : activeRecord?.clockOut ? (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircleIcon className="w-3.5 h-3.5" /> Shift Completed Today
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5" /> Not Clocked In
                </Badge>
              )}

              {activeRecord?.status === "LATE" && (
                <Badge variant="destructive" className="px-2.5 py-1 rounded-full text-xs font-semibold">
                  LATE
                </Badge>
              )}

              {activeRecord?.status === "HALF_DAY" && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <AlertCircleIcon className="w-3 h-3 text-amber-500" /> HALF DAY (&lt; 4h)
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Expected Shift: <span className="font-semibold text-foreground">{railwayTo12(settings?.expectedClockIn || "09:00")}</span> - <span className="font-semibold text-foreground">{railwayTo12(settings?.expectedClockOut || "18:00")}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Main Punch Clock Card & Work Mode Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Circular Pulse Punch Button Column */}
        <Card className="md:col-span-7 border border-border/60 bg-card shadow-lg rounded-3xl flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
          <div className="my-6 relative flex items-center justify-center">
            {/* Outer animated ring */}
            <div
              className={cn(
                "w-60 h-60 rounded-full border-4 flex items-center justify-center transition-all duration-500 shadow-2xl",
                isClockedIn
                  ? isOnBreak
                    ? "border-amber-500/40 bg-amber-500/5 animate-pulse"
                    : "border-emerald-500/40 bg-emerald-500/5"
                  : "border-primary/40 bg-primary/5 hover:scale-105"
              )}
            >
              {/* Inner main button */}
              <button
                type="button"
                disabled={loading || (isClockedIn && isOnBreak)}
                onClick={isClockedIn ? handleClockOut : handleClockIn}
                className={cn(
                  "w-48 h-48 rounded-full flex flex-col items-center justify-center text-white font-bold transition-all duration-300 shadow-xl active:scale-95 disabled:opacity-50",
                  isClockedIn
                    ? "bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 shadow-red-500/25"
                    : "bg-gradient-to-br from-primary via-emerald-600 to-teal-700 hover:brightness-110 shadow-primary/30"
                )}
              >
                {isClockedIn ? (
                  <>
                    <LogOutIcon className="w-12 h-12 mb-2 animate-bounce" />
                    <span className="text-xl tracking-wider uppercase">Clock Out</span>
                    <span className="text-xs font-normal opacity-80 mt-1">Tap to end shift</span>
                  </>
                ) : (
                  <>
                    <ClockIcon className="w-12 h-12 mb-2 animate-pulse" />
                    <span className="text-xl tracking-wider uppercase">Clock In</span>
                    <span className="text-xs font-normal opacity-80 mt-1">Tap to start shift</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Break Controls if Clocked In */}
          {isClockedIn && (
            <div className="w-full max-w-xs mt-4">
              <Button
                type="button"
                variant={isOnBreak ? "default" : "outline"}
                disabled={loading}
                onClick={handleToggleBreak}
                className={cn(
                  "w-full py-5 rounded-2xl font-semibold transition-all shadow-md",
                  isOnBreak
                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                    : "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                )}
              >
                {isOnBreak ? (
                  <>
                    <PlayIcon className="w-4 h-4 mr-2" /> Resume Shift
                  </>
                ) : (
                  <>
                    <CoffeeIcon className="w-4 h-4 mr-2" /> Take Break
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>

        {/* Work Mode & Verification Panel */}
        <div className="md:col-span-5 space-y-6">
          {/* Work Mode Selection */}
          <Card className="border border-border/60 bg-card shadow-lg rounded-3xl p-6">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <LaptopIcon className="w-5 h-5 text-primary" /> Work Mode
              </CardTitle>
              <CardDescription className="text-xs">Select your working location</CardDescription>
            </CardHeader>
            <CardContent className="p-0 grid grid-cols-3 gap-2">
              <div
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-semibold transition-all border-primary bg-primary/10 text-primary shadow-sm"
                )}

              >
                {workMode === WorkMode.OFFICE && (
                  <Building2Icon className="w-5 h-5 mb-1.5" />
                )}
                {workMode === WorkMode.REMOTE && (
                  <HomeIcon className="w-5 h-5 mb-1.5" />
                )}
                {workMode === WorkMode.HYBRID && (
                  <LaptopIcon className="w-5 h-5 mb-1.5" />
                )}
                <span>{workMode === WorkMode.OFFICE ? "Office" : workMode === WorkMode.REMOTE ? "Remote" : "Hybrid"}</span>
              </div>
              {/* {[
                { mode: WorkMode.OFFICE, label: "Office", icon: Building2Icon },
                { mode: WorkMode.REMOTE, label: "Remote", icon: HomeIcon },
                { mode: WorkMode.HYBRID, label: "Hybrid", icon: LaptopIcon },
              ].map(({ mode, label, icon: Icon }) => (
                <div
                  key={mode}
                  // type="div"
                  // disabled={isClockedIn}
                  // onClick={() => setSelectedWorkMode(mode)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-semibold transition-all",
                    workMode === mode
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border/60 hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 mb-1.5" />
                  {label}
                </div>
              ))} */}
            </CardContent>
          </Card>

          {/* Location & Geofence Distance Footer */}
          <Card className="border border-border/60 bg-card shadow-lg rounded-3xl p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPinIcon className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    {coords.lat && coords.lng
                      ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                      : isLocating
                      ? "Fetching GPS location..."
                      : locationError ? <span className="text-rose-500">{locationError}</span> : "Location unknown"}
                  </span>
                </div>
                {(!coords.lat || locationError) && (
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={fetchLocation} 
                    disabled={isLocating}
                    className="h-6 p-0 text-[10px] justify-start text-primary w-fit -mt-1 ml-6"
                  >
                    {isLocating ? "Retrying..." : "Retry Location"}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                <ShieldCheckIcon className="w-4 h-4" /> Geofence Protected
              </div>
            </div>

            {/* Office Distance Indicator if WorkMode is OFFICE */}
            {workMode === WorkMode.OFFICE && (
              <div className="pt-2 border-t border-border/40 text-xs flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Office Proximity:</span>
                {coords.lat && coords.lng && settings?.officeLatitude != null && settings?.officeLongitude != null ? (() => {
                  const R = 6371000;
                  const dLat = ((settings.officeLatitude - coords.lat!) * Math.PI) / 180;
                  const dLon = ((settings.officeLongitude - coords.lng!) * Math.PI) / 180;
                  const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos((coords.lat! * Math.PI) / 180) *
                    Math.cos((settings.officeLatitude * Math.PI) / 180) *
                    Math.sin(dLon / 2) *
                    Math.sin(dLon / 2);
                  const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                  const maxRadius = settings.officeRadiusMeters ?? 500;
                  const isInRange = dist <= maxRadius;
                  const distLabel = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist}m`;

                  return (
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1",
                        isInRange
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                      )}
                    >
                      {isInRange ? (
                        <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <AlertCircleIcon className="w-3 h-3 text-rose-500" />
                      )}
                      {distLabel} away (Limit: {maxRadius}m)
                    </Badge>
                  );
                })() : (
                  <span className="text-muted-foreground text-[11px] italic">
                    {settings?.officeLatitude == null
                      ? "Office coordinates not set by admin"
                      : "Waiting for GPS coordinates..."}
                  </span>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Selfie Camera Modal Handler */}
      {/* <SelfieCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(data) => setSelfie(data)}
        handleClockIn={handleClockIn}
      /> */}
    </div>
  );
}
