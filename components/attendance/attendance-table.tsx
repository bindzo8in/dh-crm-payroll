"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AttendanceStatus, Department } from "@/app/generated/prisma/enums";
import { getAttendanceLogsAction, exportAttendanceToExcelAction } from "@/actions/attendance";
import { RegularizationModal } from "./regularization-modal";
import { AttendanceAuditViewer } from "./attendance-audit-viewer";
import { formatTimeInIST, formatDateTimeInIST } from "@/lib/date";
import {
  LaptopIcon,
  Building2Icon,
  HomeIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  FileEditIcon,
  HistoryIcon,
  FileSpreadsheetIcon,
} from "lucide-react";
import { toast } from "sonner";

interface AttendanceTableProps {
  userRole: string;
  userDepartment?: string;
}

export function AttendanceTable({ userRole, userDepartment }: AttendanceTableProps) {
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userDepartment === "HR";
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [selectedRecordForReg, setSelectedRecordForReg] = useState<any | null>(null);
  const [selectedRecordForAudit, setSelectedRecordForAudit] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await getAttendanceLogsAction({
        page,
        limit: 10,
        status: statusFilter !== "ALL" ? (statusFilter as AttendanceStatus) : undefined,
        department: departmentFilter !== "ALL" ? (departmentFilter as Department) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setLogs(res?.records || []);
      setTotalPages(res?.totalPages || 1);
      setTotalCount(res?.totalCount || 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch attendance logs");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!isAdmin) return;
    setIsExporting(true);
    try {
      toast.loading("Exporting attendance logs to Excel...", { id: "table-export" });
      const res = await exportAttendanceToExcelAction({
        status: statusFilter !== "ALL" ? (statusFilter as AttendanceStatus) : undefined,
        department: departmentFilter !== "ALL" ? (departmentFilter as Department) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (res.success && res.base64 && res.filename) {
        const byteCharacters = window.atob(res.base64);
        const sliceSize = 1024;
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
          const slice = byteCharacters.slice(offset, offset + sliceSize);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }

        const blob = new Blob(byteArrays, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 200);

        toast.success(`Exported ${res.totalExported} records to Excel!`, { id: "table-export" });
      } else {
        toast.error(res.error || "Failed to export records", { id: "table-export" });
      }
    } catch (err: any) {
      toast.error(err.message || "Error exporting records", { id: "table-export" });
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, statusFilter, departmentFilter, startDate, endDate]);

  const getStatusBadge = (status: string, workMinutes?: number, clockOut?: string | null) => {
    switch (status) {
      case "PRESENT":
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-semibold">PRESENT</Badge>;
      case "LATE":
        return <Badge variant="destructive" className="font-semibold">LATE</Badge>;
      case "HALF_DAY":
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 font-semibold">
              HALF DAY
            </Badge>
            {clockOut && workMinutes !== undefined && workMinutes > 0 && workMinutes < 240 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                ⏱️ &lt; 4h ({Math.floor(workMinutes / 60)}h {workMinutes % 60}m)
              </span>
            )}
          </div>
        );
      case "ABSENT":
        return <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/30 font-semibold">ABSENT</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getWorkModeIcon = (mode: string) => {
    switch (mode) {
      case "REMOTE":
        return <HomeIcon className="w-3.5 h-3.5 mr-1" />;
      case "HYBRID":
        return <LaptopIcon className="w-3.5 h-3.5 mr-1" />;
      default:
        return <Building2Icon className="w-3.5 h-3.5 mr-1" />;
    }
  };

  const formatDuration = (clockIn: string, clockOut?: string, breaks: any[] = []) => {
    if (!clockOut) return "In Progress";
    const start = new Date(clockIn).getTime();
    const end = new Date(clockOut).getTime();
    let diff = end - start;

    for (const b of breaks) {
      if (b.breakStart && b.breakEnd) {
        diff -= (new Date(b.breakEnd).getTime() - new Date(b.breakStart).getTime());
      }
    }

    if (diff < 0) diff = 0;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Search and Filters Header */}
      <Card className="border border-border/60 bg-card shadow-md rounded-3xl p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <FilterIcon className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-bold">Attendance History</h2>
            <Badge variant="secondary" className="ml-2 text-xs">{totalCount} Logs</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="w-full sm:w-36">
              <Select value={statusFilter} onValueChange={(val) => { setPage(1); setStatusFilter(val); }}>
                <SelectTrigger className="rounded-xl text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="LATE">Late</SelectItem>
                  <SelectItem value="HALF_DAY">Half Day</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-40">
              <Select value={departmentFilter} onValueChange={(val) => { setPage(1); setDepartmentFilter(val); }}>
                <SelectTrigger className="rounded-xl text-xs">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Departments</SelectItem>
                  <SelectItem value="SALES">Sales</SelectItem>
                  <SelectItem value="DEVELOPMENT">Development</SelectItem>
                  <SelectItem value="DESIGN">Design</SelectItem>
                  <SelectItem value="SEO">SEO</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="OPERATIONS">Operations</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setPage(1); setStartDate(e.target.value); }}
              className="w-full sm:w-36 rounded-xl text-xs"
              placeholder="From Date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setPage(1); setEndDate(e.target.value); }}
              className="w-full sm:w-36 rounded-xl text-xs"
              placeholder="To Date"
            />

            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting || loading || totalCount === 0}
                className="rounded-xl text-xs font-semibold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 shadow-sm"
              >
                <FileSpreadsheetIcon className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                {isExporting ? "Exporting..." : "Excel"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Desktop Table View */}
      <div className="hidden md:block border border-border/60 bg-card shadow-lg rounded-3xl overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="font-semibold">Employee</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Clock In</TableHead>
              <TableHead className="font-semibold">Clock Out</TableHead>
              <TableHead className="font-semibold">Duration</TableHead>
              <TableHead className="font-semibold">Work Mode</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Selfie</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  Loading attendance records...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  No attendance records found matching your query.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((record) => (
                <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                        {record.user?.name ? record.user.name[0].toUpperCase() : "U"}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          {record.user?.name || "Employee"}
                          {(record.department || record.user?.department) && (
                            <Badge variant="outline" className="text-[10px] py-0 font-normal">
                              {record.department || record.user?.department}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{record.user?.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(record.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatTimeInIST(new Date(record.clockIn))}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {record.clockOut
                      ? formatTimeInIST(new Date(record.clockOut))
                      : "--:--"}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {formatDuration(record.clockIn, record.clockOut, record.breaks)}
                    {record.isManuallyEdited && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">Manual Entry</Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="flex items-center w-fit text-[11px]">
                      {getWorkModeIcon(record.workMode)}
                      {record.workMode}
                    </Badge>
                    {record.workMode === "OFFICE" && record.distanceFromOffice != null && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                        📍 {record.distanceFromOffice >= 1000 ? `${(record.distanceFromOffice / 1000).toFixed(2)} km` : `${record.distanceFromOffice}m`} away
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(record.status, record.workMinutes, record.clockOut)}</TableCell>
                  <TableCell>
                    {record.selfieUrl ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full overflow-hidden p-0 border border-border">
                            <img src={record.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3 bg-popover rounded-2xl border shadow-xl">
                          <img src={record.selfieUrl} alt="Selfie View" className="w-full aspect-square object-cover rounded-xl mb-2" />
                          <p className="text-[11px] text-muted-foreground text-center font-medium">
                            Selfie verified at clock-in
                          </p>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Regularize / Edit Attendance"
                          onClick={() => setSelectedRecordForReg(record)}
                        >
                          <FileEditIcon className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="View Audit Trail"
                        onClick={() => setSelectedRecordForAudit(record.id)}
                      >
                        <HistoryIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading attendance logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No attendance logs found.</div>
        ) : (
          logs.map((record) => (
            <Card key={record.id} className="border border-border/60 bg-card shadow-md rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                    {record.user?.name ? record.user.name[0].toUpperCase() : "U"}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">{record.user?.name || "Employee"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(record.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                </div>
                {getStatusBadge(record.status, record.workMinutes, record.clockOut)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-xl">
                <div>
                  <span className="text-muted-foreground text-[10px]">Clock In</span>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatTimeInIST(new Date(record.clockIn))}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px]">Clock Out</span>
                  <div className="font-semibold text-rose-600 dark:text-rose-400">
                    {record.clockOut
                      ? formatTimeInIST(new Date(record.clockOut))
                      : "In Progress"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {getWorkModeIcon(record.workMode)}
                  <span>{record.workMode}</span>
                  <span>•</span>
                  <span>{formatDuration(record.clockIn, record.clockOut, record.breaks)}</span>
                  {record.isManuallyEdited && (
                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 ml-1">Manual</Badge>
                  )}
                </div>

                {record.selfieUrl && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-lg">
                        <CameraIcon className="w-3 h-3 mr-1" /> View Selfie
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 bg-popover rounded-2xl border shadow-xl">
                      <img src={record.selfieUrl} alt="Selfie View" className="w-full aspect-square object-cover rounded-xl mb-2" />
                      <p className="text-[11px] text-muted-foreground text-center font-medium">
                        Verified selfie snapshot
                      </p>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-xl"
          >
            <ChevronLeftIcon className="w-4 h-4 mr-1" /> Previous
          </Button>

          <span className="text-xs text-muted-foreground font-medium">
            Page {page} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl"
          >
            Next <ChevronRightIcon className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Regularization Modal */}
      {selectedRecordForReg && (
        <RegularizationModal
          isOpen={!!selectedRecordForReg}
          onClose={() => setSelectedRecordForReg(null)}
          record={selectedRecordForReg}
          onSuccess={fetchLogs}
        />
      )}

      {/* Audit Trail Viewer */}
      {selectedRecordForAudit && (
        <AttendanceAuditViewer
          isOpen={!!selectedRecordForAudit}
          onClose={() => setSelectedRecordForAudit(null)}
          recordId={selectedRecordForAudit}
        />
      )}
    </div>
  );
}
