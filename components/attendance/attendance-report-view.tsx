"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttendanceStatus, Department, WorkMode } from "@/app/generated/prisma/enums";
import {
  getDetailedAttendanceReportAction,
  getAttendanceEmployeesListAction,
  exportAttendanceToExcelAction,
} from "@/actions/attendance";
import { formatTimeInIST, formatDateTimeInIST, formatInIST } from "@/lib/date";
import {
  FileSpreadsheetIcon,
  FilterIcon,
  SlidersHorizontalIcon,
  RefreshCwIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  TrendingUpIcon,
  PercentIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserIcon,
  Building2Icon,
  XIcon,
  DownloadIcon,
  LaptopIcon,
  SearchIcon,
  CalendarIcon,
  ShieldCheckIcon,
  ArrowUpDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AttendanceReportViewProps {
  userRole: string;
  userDepartment?: string;
}

export function AttendanceReportView({ userRole, userDepartment }: AttendanceReportViewProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, startExportTransition] = useTransition();
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Filter States
  const [page, setPage] = useState(1);
  const [datePreset, setDatePreset] = useState<string>("THIS_MONTH");
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedWorkMode, setSelectedWorkMode] = useState<string>("ALL");

  // Advanced toggles
  const [onlyLate, setOnlyLate] = useState(false);
  const [minLateMins, setMinLateMins] = useState<number>(0);
  const [onlyEarlyLeave, setOnlyEarlyLeave] = useState(false);
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [onlyExcessiveBreaks, setOnlyExcessiveBreaks] = useState(false);
  const [onlyAutoCheckedOut, setOnlyAutoCheckedOut] = useState(false);
  const [onlyRegularized, setOnlyRegularized] = useState(false);
  const [onlyManuallyEdited, setOnlyManuallyEdited] = useState(false);
  const [geofenceFilter, setGeofenceFilter] = useState<string>("ALL");

  // Data & Summary State
  const [reportData, setReportData] = useState<{
    records: any[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    summary: any;
  }>({
    records: [],
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    summary: null,
  });

  // Load employee list for dropdown filter
  useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await getAttendanceEmployeesListAction();
        if (res.success && res.users) {
          setEmployees(res.users);
        }
      } catch (err) {
        console.error("Failed to load employees list:", err);
      }
    }
    loadEmployees();
  }, []);

  // Quick Preset Date handler
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    let s = "";
    let e = now.toISOString().split("T")[0];

    if (preset === "TODAY") {
      s = e;
    } else if (preset === "YESTERDAY") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      s = y.toISOString().split("T")[0];
      e = s;
    } else if (preset === "THIS_WEEK") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      s = monday.toISOString().split("T")[0];
      e = new Date().toISOString().split("T")[0];
    } else if (preset === "LAST_WEEK") {
      const prevMonday = new Date();
      prevMonday.setDate(prevMonday.getDate() - ((prevMonday.getDay() + 6) % 7) - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevSunday.getDate() + 6);
      s = prevMonday.toISOString().split("T")[0];
      e = prevSunday.toISOString().split("T")[0];
    } else if (preset === "THIS_MONTH") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      s = firstDay.toISOString().split("T")[0];
      e = new Date().toISOString().split("T")[0];
    } else if (preset === "LAST_MONTH") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      s = firstDay.toISOString().split("T")[0];
      e = lastDay.toISOString().split("T")[0];
    } else if (preset === "THIS_QUARTER") {
      const quarter = Math.floor(now.getMonth() / 3);
      const firstDay = new Date(now.getFullYear(), quarter * 3, 1);
      s = firstDay.toISOString().split("T")[0];
      e = new Date().toISOString().split("T")[0];
    }

    if (preset !== "CUSTOM") {
      setStartDate(s);
      setEndDate(e);
      setPage(1);
    }
  };

  // Build filter payload
  const buildFilterPayload = () => {
    return {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      department: selectedDept !== "ALL" ? (selectedDept as Department) : undefined,
      userId: selectedEmployee !== "ALL" ? selectedEmployee : undefined,
      status: selectedStatus !== "ALL" ? (selectedStatus as AttendanceStatus) : undefined,
      workMode: selectedWorkMode !== "ALL" ? (selectedWorkMode as WorkMode) : undefined,
      onlyLate: onlyLate || undefined,
      minLateMinutes: minLateMins > 0 ? minLateMins : undefined,
      onlyEarlyLeave: onlyEarlyLeave || undefined,
      onlyOvertime: onlyOvertime || undefined,
      onlyExcessiveBreaks: onlyExcessiveBreaks || undefined,
      onlyAutoCheckedOut: onlyAutoCheckedOut || undefined,
      onlyRegularized: onlyRegularized || undefined,
      onlyManuallyEdited: onlyManuallyEdited || undefined,
      geofenceFilter: geofenceFilter !== "ALL" ? (geofenceFilter as any) : undefined,
      page,
      limit: 25,
    };
  };

  // Fetch report data
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const payload = buildFilterPayload();
      const res = await getDetailedAttendanceReportAction(payload);
      if (res.success) {
        setReportData({
          records: res.records || [],
          totalCount: res.totalCount || 0,
          totalPages: res.totalPages || 1,
          currentPage: res.currentPage || 1,
          summary: res.summary,
        });
      } else {
        toast.error(res.error || "Failed to load attendance report");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch attendance report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [
    page,
    startDate,
    endDate,
    selectedDept,
    selectedEmployee,
    selectedStatus,
    selectedWorkMode,
    onlyLate,
    minLateMins,
    onlyEarlyLeave,
    onlyOvertime,
    onlyExcessiveBreaks,
    onlyAutoCheckedOut,
    onlyRegularized,
    onlyManuallyEdited,
    geofenceFilter,
  ]);

  // Export to Excel handler
  const handleExportExcel = () => {
    startExportTransition(async () => {
      try {
        toast.loading("Generating customized Excel report...", { id: "excel-export" });
        const payload = buildFilterPayload();
        const res = await exportAttendanceToExcelAction(payload);

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

          toast.success(`Exported ${res.totalExported} attendance records to Excel!`, { id: "excel-export" });
        } else {
          toast.error(res.error || "Failed to export Excel report", { id: "excel-export" });
        }
      } catch (err: any) {
        toast.error(err.message || "Error exporting Excel report", { id: "excel-export" });
      }
    });
  };

  // Reset all filters
  const handleResetFilters = () => {
    setDatePreset("THIS_MONTH");
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(firstDay.toISOString().split("T")[0]);
    setEndDate(now.toISOString().split("T")[0]);
    setSelectedDept("ALL");
    setSelectedEmployee("ALL");
    setSelectedStatus("ALL");
    setSelectedWorkMode("ALL");
    setOnlyLate(false);
    setMinLateMins(0);
    setOnlyEarlyLeave(false);
    setOnlyOvertime(false);
    setOnlyExcessiveBreaks(false);
    setOnlyAutoCheckedOut(false);
    setOnlyRegularized(false);
    setOnlyManuallyEdited(false);
    setGeofenceFilter("ALL");
    setPage(1);
  };

  // Count active advanced filters
  const activeAdvancedCount = [
    onlyLate,
    minLateMins > 0,
    onlyEarlyLeave,
    onlyOvertime,
    onlyExcessiveBreaks,
    onlyAutoCheckedOut,
    onlyRegularized,
    onlyManuallyEdited,
    geofenceFilter !== "ALL",
    selectedWorkMode !== "ALL",
    selectedStatus !== "ALL",
  ].filter(Boolean).length;

  const summary = reportData.summary;

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* 1. TOP HEADER & EXPORT TOOLBAR */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card border border-border/70 p-5 md:p-6 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-extrabold tracking-tight">Detailed Attendance Reports</h2>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
              ADMIN / HR
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Filter multi-department shift logs, punctuality metrics, and export formatted Excel workbooks.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReportData}
            disabled={loading}
            className="rounded-2xl text-xs font-semibold shadow-sm"
          >
            <RefreshCwIcon className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>

          <Button
            onClick={handleExportExcel}
            disabled={isExporting || loading || reportData.totalCount === 0}
            className="rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all active:scale-[0.98]"
          >
            <FileSpreadsheetIcon className="w-4 h-4 mr-2" />
            {isExporting ? "Exporting..." : "Export to Excel (.xlsx)"}
          </Button>
        </div>
      </div>

      {/* 2. PRIMARY FILTER BAR */}
      <Card className="border border-border/70 rounded-3xl shadow-sm p-4 md:p-5 space-y-4">
        {/* Date Presets Pill Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {[
            { id: "TODAY", label: "Today" },
            { id: "YESTERDAY", label: "Yesterday" },
            { id: "THIS_WEEK", label: "This Week" },
            { id: "LAST_WEEK", label: "Last Week" },
            { id: "THIS_MONTH", label: "This Month" },
            { id: "LAST_MONTH", label: "Last Month" },
            { id: "THIS_QUARTER", label: "This Quarter" },
            { id: "CUSTOM", label: "Custom Range" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleDatePresetChange(preset.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap text-xs shrink-0",
                datePreset === preset.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Custom Date Range */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("CUSTOM");
                setPage(1);
              }}
              className="rounded-xl text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("CUSTOM");
                setPage(1);
              }}
              className="rounded-xl text-xs h-9"
            />
          </div>

          {/* Department Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Department</label>
            <Select
              value={selectedDept}
              onValueChange={(val) => {
                setSelectedDept(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="rounded-xl text-xs h-9">
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

          {/* Employee Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Employee</label>
            <Select
              value={selectedEmployee}
              onValueChange={(val) => {
                setSelectedEmployee(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="rounded-xl text-xs h-9">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="ALL">All Employees</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} {emp.employeeNo ? `(${emp.employeeNo})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Secondary Bar with Advanced Toggle & Active Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isAdvancedOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              className="rounded-xl text-xs font-semibold h-8"
            >
              <SlidersHorizontalIcon className="w-3.5 h-3.5 mr-1.5" />
              Advanced Filters
              {activeAdvancedCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-primary-foreground text-primary rounded-full text-[10px] font-bold">
                  {activeAdvancedCount}
                </span>
              )}
            </Button>

            {activeAdvancedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="rounded-xl text-xs text-muted-foreground hover:text-destructive h-8"
              >
                <XIcon className="w-3.5 h-3.5 mr-1" />
                Reset Filters
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            Showing <strong className="text-foreground">{reportData.records.length}</strong> of{" "}
            <strong className="text-foreground">{reportData.totalCount}</strong> shifts
          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer */}
        {isAdvancedOpen && (
          <div className="mt-3 p-4 bg-muted/40 rounded-2xl border border-border/60 space-y-4 text-xs animate-in fade-in-50 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Status Select */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground">Attendance Status</label>
                <Select
                  value={selectedStatus}
                  onValueChange={(val) => {
                    setSelectedStatus(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="rounded-xl text-xs h-8 bg-background">
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

              {/* Work Mode */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground">Work Mode</label>
                <Select
                  value={selectedWorkMode}
                  onValueChange={(val) => {
                    setSelectedWorkMode(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="rounded-xl text-xs h-8 bg-background">
                    <SelectValue placeholder="All Work Modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Work Modes</SelectItem>
                    <SelectItem value="OFFICE">Office</SelectItem>
                    <SelectItem value="REMOTE">Remote</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Geofence Compliance */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground">Geofence Compliance</label>
                <Select
                  value={geofenceFilter}
                  onValueChange={(val) => {
                    setGeofenceFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="rounded-xl text-xs h-8 bg-background">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Locations</SelectItem>
                    <SelectItem value="IN_OFFICE">Within Office Radius (&le; 500m)</SelectItem>
                    <SelectItem value="OUTSIDE_OR_REMOTE">Outside Office / Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Minimum Late Minutes */}
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground">Min Late Duration (Mins)</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 15"
                  value={minLateMins || ""}
                  onChange={(e) => {
                    setMinLateMins(Number(e.target.value) || 0);
                    setPage(1);
                  }}
                  className="rounded-xl text-xs h-8 bg-background"
                />
              </div>
            </div>

            {/* Checkbox / Toggle Flags */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-border/40">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyLate}
                  onChange={(e) => {
                    setOnlyLate(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <span className="font-medium text-foreground">Late Only</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyEarlyLeave}
                  onChange={(e) => {
                    setOnlyEarlyLeave(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <span className="font-medium text-foreground">Early Leave</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyOvertime}
                  onChange={(e) => {
                    setOnlyOvertime(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <span className="font-medium text-foreground">Overtime Only</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyExcessiveBreaks}
                  onChange={(e) => {
                    setOnlyExcessiveBreaks(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <span className="font-medium text-foreground">Excess Breaks (&gt;1h)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyAutoCheckedOut}
                  onChange={(e) => {
                    setOnlyAutoCheckedOut(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <span className="font-medium text-foreground">Auto Closed</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyRegularized}
                  onChange={(e) => {
                    setOnlyRegularized(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <span className="font-medium text-foreground">Regularized</span>
              </label>
            </div>
          </div>
        )}
      </Card>

      {/* 3. KPI SUMMARY CARDS */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Card className="border border-border/70 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-card to-muted/40">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Shifts</div>
            <div className="text-xl font-extrabold mt-1">{summary.totalRecords}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{summary.statusCounts?.PRESENT || 0} Present</div>
          </Card>

          <Card className="border border-border/70 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-emerald-500/10 via-card to-card">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Net Work Hours</div>
            <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              {summary.totalWorkHours}h
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Avg {summary.avgWorkHoursPerDay}h/day</div>
          </Card>

          <Card className="border border-border/70 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-sky-500/10 via-card to-card">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Punctuality</div>
            <div className="text-xl font-extrabold text-sky-600 dark:text-sky-400 mt-1">
              {summary.punctualityRate}%
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{summary.lateCount} late incidents</div>
          </Card>

          <Card className="border border-border/70 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-purple-500/10 via-card to-card">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Overtime</div>
            <div className="text-xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
              {summary.totalOvertimeHours}h
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{summary.totalBreakHours}h break time</div>
          </Card>

          <Card className="border border-border/70 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-amber-500/10 via-card to-card">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Half Days</div>
            <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {summary.statusCounts?.HALF_DAY || 0}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{summary.earlyLeaveCount} early leaves</div>
          </Card>

          <Card className="border border-border/70 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-rose-500/10 via-card to-card">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Auto Closed</div>
            <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
              {summary.autoCheckedOutCount || 0}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{summary.regularizedCount} regularized</div>
          </Card>
        </div>
      )}

      {/* 4. DETAILED DATA TABLE */}
      <Card className="border border-border/70 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <h3 className="text-sm font-bold">Shift Records Ledger</h3>
          <div className="text-xs text-muted-foreground">
            Page {reportData.currentPage} of {reportData.totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="text-xs">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Gross Work</TableHead>
                <TableHead>Breaks</TableHead>
                <TableHead>Net Hours</TableHead>
                <TableHead>Late / Overtime</TableHead>
                <TableHead>Regularized</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12 text-sm text-muted-foreground">
                    <RefreshCwIcon className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading attendance records...
                  </TableCell>
                </TableRow>
              ) : reportData.records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12 text-sm text-muted-foreground">
                    No attendance records found matching current filters.
                  </TableCell>
                </TableRow>
              ) : (
                reportData.records.map((rec, idx) => {
                  const clockInFormatted = rec.clockIn ? formatInIST(new Date(rec.clockIn), "hh:mm a") : "-";
                  const clockOutFormatted = rec.clockOut
                    ? formatInIST(new Date(rec.clockOut), "hh:mm a")
                    : rec.isAutoCheckedOut
                    ? "Auto-Closed"
                    : "Active";

                  const grossMins =
                    rec.clockIn && rec.clockOut
                      ? Math.max(0, Math.round((new Date(rec.clockOut).getTime() - new Date(rec.clockIn).getTime()) / (1000 * 60)))
                      : 0;

                  return (
                    <TableRow key={rec.id} className="text-xs hover:bg-muted/40 transition-colors">
                      <TableCell className="text-muted-foreground">
                        {(page - 1) * 25 + idx + 1}
                      </TableCell>

                      <TableCell className="font-semibold whitespace-nowrap">
                        {rec.date ? formatInIST(new Date(rec.date), "dd MMM yyyy") : "-"}
                      </TableCell>

                      <TableCell>
                        <div className="font-bold">{rec.user?.name || "N/A"}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                          {rec.user?.employeeNo ? `${rec.user.employeeNo} • ` : ""}
                          {rec.user?.email}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {rec.department || rec.user?.department || "N/A"}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <span className="text-[11px] font-medium">{rec.workMode}</span>
                      </TableCell>

                      <TableCell>
                        {rec.status === "PRESENT" && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                            PRESENT
                          </Badge>
                        )}
                        {rec.status === "LATE" && (
                          <Badge variant="destructive" className="text-[10px] font-bold">
                            LATE ({rec.lateMinutes}m)
                          </Badge>
                        )}
                        {rec.status === "HALF_DAY" && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-bold">
                            HALF DAY
                          </Badge>
                        )}
                        {rec.status === "ABSENT" && (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-[10px] font-bold">
                            ABSENT
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                        {clockInFormatted}
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-medium text-rose-600 dark:text-rose-400">
                        {clockOutFormatted}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {grossMins > 0 ? `${Math.floor(grossMins / 60)}h ${grossMins % 60}m` : "-"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {rec.breakMinutes > 0 ? `${rec.breakMinutes}m` : "0m"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-bold text-foreground">
                        {rec.workMinutes > 0 ? `${Math.floor(rec.workMinutes / 60)}h ${rec.workMinutes % 60}m` : "-"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {rec.overtimeMinutes > 0 ? (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            +{Math.floor(rec.overtimeMinutes / 60)}h {rec.overtimeMinutes % 60}m
                          </span>
                        ) : rec.lateMinutes > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">
                            -{rec.lateMinutes}m late
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {rec.regularized ? (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px]">
                            Regularized
                          </Badge>
                        ) : rec.isManuallyEdited ? (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px]">
                            Edited
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        {reportData.totalPages > 1 && (
          <div className="p-4 border-t border-border/60 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Showing {(page - 1) * 25 + 1} to {Math.min(page * 25, reportData.totalCount)} of {reportData.totalCount} records
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl text-xs h-8"
              >
                <ChevronLeftIcon className="w-4 h-4 mr-1" /> Previous
              </Button>

              <span className="text-xs font-semibold px-2">
                {page} / {reportData.totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= reportData.totalPages || loading}
                onClick={() => setPage((p) => Math.min(reportData.totalPages, p + 1))}
                className="rounded-xl text-xs h-8"
              >
                Next <ChevronRightIcon className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
