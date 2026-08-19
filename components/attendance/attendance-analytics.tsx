"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getAttendanceAnalyticsAction, getAttendanceEmployeesListAction } from "@/actions/attendance";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  ClockIcon,
  PercentIcon,
  TrendingUpIcon,
  CalendarIcon,
  ActivityIcon,
  UsersIcon,
  AwardIcon,
  ZapIcon,
  RefreshCwIcon,
  Building2Icon,
  LaptopIcon,
  ShieldAlertIcon,
  ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Department } from "@/app/generated/prisma/enums";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

type DatePreset = "7d" | "14d" | "30d" | "thisMonth" | "all" | "custom";

export function AttendanceAnalytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Filters State
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [employeeFilter, setEmployeeFilter] = useState<string>("ALL");
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; email: string; employeeNo?: string | null; department?: string | null }>>([]);

  // Load employee list on mount
  useEffect(() => {
    getAttendanceEmployeesListAction().then((res) => {
      if (res.success && res.users) {
        setEmployees(res.users);
      }
    });
  }, []);

  // Handle Date Presets
  const applyPreset = (newPreset: DatePreset) => {
    setPreset(newPreset);
    const today = new Date();
    if (newPreset === "7d") {
      setStartDate(format(subDays(today, 6), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (newPreset === "14d") {
      setStartDate(format(subDays(today, 13), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (newPreset === "30d") {
      setStartDate(format(subDays(today, 29), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (newPreset === "thisMonth") {
      setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
    } else if (newPreset === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await getAttendanceAnalyticsAction({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        department: departmentFilter !== "ALL" ? departmentFilter : undefined,
        userId: employeeFilter !== "ALL" ? employeeFilter : undefined,
      });

      if (res && res.success) {
        setData(res);
      } else {
        toast.error(res.error || "Failed to load attendance analytics");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load attendance analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startTransition(() => {
      fetchAnalytics();
    });
  }, [startDate, endDate, departmentFilter, employeeFilter]);

  const summary = data?.summary || {};
  const timeSeriesData = data?.timeSeriesData || [];
  const departmentBreakdown = data?.departmentBreakdown || [];
  const workModeDistribution = data?.workModeDistribution || [];
  const dayOfWeekStats = data?.dayOfWeekStats || [];
  const topPunctual = data?.topPunctual || [];
  const topOvertime = data?.topOvertime || [];

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* 1. Header & Filter Command Bar */}
      <div className="bg-card border border-border/70 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <ActivityIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">
                  Attendance Intelligence & Analytics
                </h2>
                <p className="text-xs text-muted-foreground">
                  Real-time punctuality trends, shift duration analytics, and organizational health metrics
                </p>
              </div>
            </div>
          </div>

          {/* Quick Refresh */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAnalytics}
              disabled={loading}
              className="rounded-xl text-xs h-9 gap-1.5 border-border/80 hover:bg-muted"
            >
              <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Date Presets + Dropdown Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-border/40">
          {/* Preset Buttons */}
          <div className="md:col-span-6 flex flex-wrap items-center gap-1.5">
            {[
              { id: "thisMonth", label: "This Month" },
              { id: "30d", label: "Last 30 Days" },
              { id: "14d", label: "Last 14 Days" },
              { id: "7d", label: "Last 7 Days" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ].map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={preset === item.id ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(item.id as DatePreset)}
                className={`text-xs h-8 px-3 rounded-xl font-medium transition-all ${
                  preset === item.id
                    ? "shadow-sm bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground border-border/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {/* Department Filter */}
          <div className="md:col-span-3">
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="rounded-xl text-xs h-8 bg-background/50 border-border/70">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">🏢 All Departments</SelectItem>
                {Object.values(Department).map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employee Filter */}
          <div className="md:col-span-3">
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="rounded-xl text-xs h-8 bg-background/50 border-border/70">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="ALL">👥 All Employees</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} {emp.employeeNo ? `(${emp.employeeNo})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom Date Range Picker Inputs */}
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 bg-muted/30 p-3 rounded-2xl border border-border/40">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs w-36 rounded-xl bg-background"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs w-36 rounded-xl bg-background"
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Aggregating attendance telemetry & analytics...</p>
        </div>
      ) : (
        <>
          {/* 2. Top-Level Metric Scorecards Grid (6 KPIs) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* 1. Punctuality Rate */}
            <Card className="border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-card shadow-sm rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Punctuality</span>
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <PercentIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight">
                  {summary.punctualityRate || 0}%
                </div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  <TrendingUpIcon className="w-3 h-3" />
                  <span>{summary.presentCount || 0} on-time shifts</span>
                </div>
              </div>
            </Card>

            {/* 2. Total Net Hours Logged */}
            <Card className="border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-card to-card shadow-sm rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Work Hours</span>
                <div className="w-7 h-7 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-600 dark:text-sky-400">
                  <ClockIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight">
                  {summary.totalWorkHours || 0}
                  <span className="text-xs font-semibold text-muted-foreground ml-1">hrs</span>
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-1">
                  Avg {summary.avgWorkHoursPerDay || 0}h / shift
                </div>
              </div>
            </Card>

            {/* 3. Overtime Output */}
            <Card className="border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-card shadow-sm rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Overtime</span>
                <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <ZapIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl lg:text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                  {summary.totalOvertimeHours || 0}
                  <span className="text-xs font-semibold text-muted-foreground ml-1">hrs</span>
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-1">
                  Extra shift effort
                </div>
              </div>
            </Card>

            {/* 4. Late Arrivals */}
            <Card className="border border-rose-500/20 bg-gradient-to-br from-rose-500/10 via-card to-card shadow-sm rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Late Clock-Ins</span>
                <div className="w-7 h-7 rounded-full bg-rose-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <AlertTriangleIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl lg:text-3xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight">
                  {summary.lateCount || 0}
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-1">
                  {summary.totalLateMinutes || 0} mins delay total
                </div>
              </div>
            </Card>

            {/* 5. Half-Days & Leaves */}
            <Card className="border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-card to-card shadow-sm rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Half Days</span>
                <div className="w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <CalendarIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight">
                  {summary.halfDayCount || 0}
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-1">
                  {summary.absentCount || 0} absent / leaves
                </div>
              </div>
            </Card>

            {/* 6. Total Shifts Tracked */}
            <Card className="border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total Shifts</span>
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                  <UsersIcon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight">
                  {summary.totalShifts || 0}
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-1">
                  {summary.regularizedCount || 0} regularized
                </div>
              </div>
            </Card>
          </div>

          {/* 3. Primary Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chart 1: Daily Attendance Status Stack (8 Cols) */}
            <Card className="lg:col-span-7 border border-border/70 bg-card shadow-sm rounded-3xl p-5 md:p-6">
              <CardHeader className="p-0 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base md:text-lg font-bold flex items-center gap-2">
                      <ActivityIcon className="w-4 h-4 text-primary" />
                      Daily Attendance Distribution
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Time-series volume of Present, Late, Half-Day, and Absent shifts
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                    Stacked Daily
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0 h-72 w-full">
                {timeSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          borderRadius: "14px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#fff",
                          fontSize: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                      <Bar dataKey="present" name="Present (On-Time)" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="late" name="Late Arrival" stackId="a" fill="#f43f5e" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="halfDay" name="Half Day" stackId="a" fill="#eab308" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="absent" name="Absent" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-medium">
                    No attendance records logged in this timeframe.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart 2: Cumulative Work Hours & Overtime (5 Cols) */}
            <Card className="lg:col-span-5 border border-border/70 bg-card shadow-sm rounded-3xl p-5 md:p-6">
              <CardHeader className="p-0 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base md:text-lg font-bold flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-sky-500" />
                      Shift Work vs Overtime
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Cumulative hours productive vs overtime load
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                    Hours
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0 h-72 w-full">
                {timeSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorNetHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorOtHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          borderRadius: "14px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="hours"
                        name="Regular Hours"
                        stroke="#0284c7"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorNetHours)"
                      />
                      <Area
                        type="monotone"
                        dataKey="overtimeHours"
                        name="Overtime Hours"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorOtHours)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-medium">
                    No hour metrics logged yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 4. Secondary Row: Department Matrix + Work Mode & Day of Week */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Department Comparison Chart (6 Cols) */}
            <Card className="lg:col-span-6 border border-border/70 bg-card shadow-sm rounded-3xl p-5 md:p-6">
              <CardHeader className="p-0 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Building2Icon className="w-4 h-4 text-emerald-500" />
                      Department Punctuality Index
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      On-time rate % and volume comparison across departments
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0 h-64 w-full">
                {departmentBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={departmentBreakdown}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                      <YAxis type="category" dataKey="department" tick={{ fontSize: 10 }} tickLine={false} width={80} />
                      <Tooltip
                        formatter={(val: any) => [`${val}%`, "Punctuality Rate"]}
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          borderRadius: "12px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="punctualityRate" name="Punctuality %" fill="#10b981" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-medium">
                    No department data logged.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Work Mode & Day of Week Pattern (6 Cols) */}
            <Card className="lg:col-span-6 border border-border/70 bg-card shadow-sm rounded-3xl p-5 md:p-6">
              <CardHeader className="p-0 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <LaptopIcon className="w-4 h-4 text-purple-500" />
                      Day-of-Week Punctuality Heat
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Weekday attendance arrival pattern (Mon - Sat)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0 h-64 w-full">
                {dayOfWeekStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayOfWeekStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          borderRadius: "12px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={32}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                      <Bar dataKey="onTime" name="On Time" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="late" name="Late Arrivals" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-medium">
                    No weekday pattern available.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 5. Performance Champions & Overtime Leaders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Punctuality Champions */}
            <Card className="border border-border/70 bg-card shadow-sm rounded-3xl p-5 md:p-6">
              <div className="flex items-center justify-between pb-4 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <AwardIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Punctuality Champions</h3>
                    <p className="text-[11px] text-muted-foreground">Top consistent on-time employees</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-500/10 border-emerald-500/20 font-semibold">
                  Top Performers
                </Badge>
              </div>

              <div className="mt-4 divide-y divide-border/40">
                {topPunctual.length > 0 ? (
                  topPunctual.map((emp: any, idx: number) => (
                    <div key={idx} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                          #{idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{emp.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {emp.employeeNo} • {emp.department}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                          {emp.punctualityRate}%
                        </span>
                        <p className="text-[10px] text-muted-foreground">{emp.onTime}/{emp.shifts} shifts</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">No shift records to rank yet.</p>
                )}
              </div>
            </Card>

            {/* Top Overtime Leaders */}
            <Card className="border border-border/70 bg-card shadow-sm rounded-3xl p-5 md:p-6">
              <div className="flex items-center justify-between pb-4 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <ZapIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Overtime Leaders</h3>
                    <p className="text-[11px] text-muted-foreground">Highest additional hours contributed</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] text-amber-600 bg-amber-500/10 border-amber-500/20 font-semibold">
                  Sprint Output
                </Badge>
              </div>

              <div className="mt-4 divide-y divide-border/40">
                {topOvertime.length > 0 ? (
                  topOvertime.map((emp: any, idx: number) => (
                    <div key={idx} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                          #{idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{emp.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {emp.employeeNo} • {emp.department}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">
                          +{emp.overtimeHours} hrs
                        </span>
                        <p className="text-[10px] text-muted-foreground">Overtime load</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">No overtime hours logged.</p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
