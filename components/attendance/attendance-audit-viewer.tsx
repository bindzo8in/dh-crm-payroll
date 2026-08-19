"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getAttendanceAuditLogsAction } from "@/actions/attendance";
import { formatDateTimeInIST } from "@/lib/date";
import { HistoryIcon, ShieldCheckIcon, AlertCircleIcon } from "lucide-react";
import { toast } from "sonner";

interface AttendanceAuditViewerProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string | null;
}

export function AttendanceAuditViewer({ isOpen, onClose, recordId }: AttendanceAuditViewerProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && recordId) {
      const fetchAudit = async () => {
        setLoading(true);
        try {
          const res = await getAttendanceAuditLogsAction(recordId);
          if (res.success) {
            setLogs(res.logs);
          } else {
            toast.error(res.error || "Failed to load audit logs");
          }
        } catch (err: any) {
          toast.error(err.message || "Failed to load audit logs");
        } finally {
          setLoading(false);
        }
      };
      fetchAudit();
    }
  }, [isOpen, recordId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-background border-border p-6 rounded-3xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <HistoryIcon className="w-5 h-5 text-primary" /> Attendance Audit History
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Immutable log of all modifications, regularizations, and system auto-checkouts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 py-2">
          {loading ? (
            <div className="text-center py-10 text-xs text-muted-foreground">Loading audit trail...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">No audit entries recorded.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="border border-border/60 bg-muted/20 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {log.action}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateTimeInIST(new Date(log.createdAt))}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-xs font-medium text-foreground bg-background p-2 rounded-xl border border-border/40">
                    <span className="font-bold text-primary">Reason: </span>
                    {log.reason}
                  </p>
                )}

                {log.newValues && (
                  <div className="text-[11px] text-muted-foreground font-mono bg-card p-2 rounded-xl border border-border/40 overflow-x-auto">
                    {log.newValues}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
