"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileEditIcon, RefreshCwIcon, CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { utcToDateTimeLocal, dateTimeLocalToUTC } from "@/lib/date";

interface RegularizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: any;
  onSuccess: () => void;
}

export function RegularizationModal({ isOpen, onClose, record, onSuccess }: RegularizationModalProps) {
  const [clockIn, setClockIn] = useState<string>(
    record?.clockIn ? utcToDateTimeLocal(new Date(record.clockIn)) : ""
  );
  const [clockOut, setClockOut] = useState<string>(
    record?.clockOut ? utcToDateTimeLocal(new Date(record.clockOut)) : ""
  );
  const [status, setStatus] = useState<string>(record?.status || "PRESENT");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.length < 5) {
      toast.error("Please provide a clear reason (at least 5 characters).");
      return;
    }

    setLoading(true);
    try {
      // Convert IST datetime-local values to UTC for storage
      const clockInUTC = dateTimeLocalToUTC(clockIn).toISOString();
      const clockOutUTC = clockOut ? dateTimeLocalToUTC(clockOut).toISOString() : undefined;

      const response = await fetch("/api/attendance/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceRecordId: record.id,
          clockIn: clockInUTC,
          clockOut: clockOutUTC,
          status,
          reason,
        }),
      });

      const res = await response.json();

      if (!res.success) {
        toast.error(res.error || "Failed to submit regularization");
        return;
      }

      toast.success("Attendance regularized successfully!");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit regularization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-background border-border p-6 rounded-3xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <FileEditIcon className="w-5 h-5 text-primary" /> Regularization Request
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Correct missing or inaccurate check-in/out timestamps (IST timezone) with a mandatory reason for audit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Corrected Clock In</Label>
            <Input
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              className="rounded-xl text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Corrected Clock Out (Optional)</Label>
            <Input
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-xl text-xs">
                <SelectValue placeholder="Select Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENT">Present</SelectItem>
                <SelectItem value="LATE">Late</SelectItem>
                <SelectItem value="HALF_DAY">Half Day</SelectItem>
                <SelectItem value="ABSENT">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason for Adjustment</Label>
            <Textarea
              placeholder="e.g. System offline / Forgot check-out / Client visit..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-xl text-xs min-h-[80px]"
              required
            />
          </div>

          <DialogFooter className="flex items-center justify-between gap-3 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full rounded-xl">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="w-full rounded-xl font-semibold">
              {loading ? (
                <>
                  <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2Icon className="w-4 h-4 mr-2" /> Save Adjustment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
