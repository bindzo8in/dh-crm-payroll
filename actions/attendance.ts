"use server";

import { UserRole, WorkMode, Department } from "@/app/generated/prisma/enums";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { userAgent } from "next/server";
import {
  clockInSchema,
  ClockInInput,
  clockOutSchema,
  ClockOutInput,
  startBreakSchema,
  StartBreakInput,
  endBreakSchema,
  EndBreakInput,
  attendanceFilterSchema,
  AttendanceFilterInput,
  regularizeAttendanceSchema,
  RegularizeAttendanceInput,
  updateAttendanceSettingsSchema,
  UpdateAttendanceSettingsInput,
  editAttendanceSchema,
  EditAttendanceInput,
  advancedAttendanceReportSchema,
  AdvancedAttendanceReportInput,
} from "@/lib/schemas/attendance-schema";
import { headers } from "next/headers";
import { getNowInIST, convertToIST, getAttendanceDate, formatInIST } from "@/lib/date";
import ExcelJS from "exceljs";

function isAttendanceManager(user: { role?: UserRole | string | null; department?: Department | string | null }): boolean {
  if (!user) return false;
  const role = user.role ? String(user.role).toUpperCase() : "";
  const dept = user.department ? String(user.department).toUpperCase() : "";
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (role === "STAFF" && dept === "HR") return true;
  return false;
}

async function getAuthenticatedUser() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  return { session, reqHeaders };
}

function getTodayDateOnly(dateInput: Date = new Date()): Date {
  // Convert to IST, get date only, then convert back to UTC
  const istDate = convertToIST(dateInput);
  const d = new Date(istDate);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseDateRangeFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  const dateClause: any = {};
  if (startDate) {
    const parts = startDate.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      dateClause.gte = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
    }
  }
  if (endDate) {
    const parts = endDate.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      dateClause.lte = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999));
    }
  }
  return Object.keys(dateClause).length > 0 ? dateClause : undefined;
}

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function getAttendanceSettings() {
  try {
    let settings = await prisma.attendanceSettings.findFirst();
    if (!settings) {
      settings = await prisma.attendanceSettings.create({
        data: {
          expectedClockIn: "09:00",
          expectedClockOut: "18:00",
          gracePeriodMinutes: 15,
          halfDayThresholdMinutes: 240,
          maxShiftHoursCap: 16,
          allowOvernightShift: true,
          officeLatitude: null,
          officeLongitude: null,
          officeRadiusMeters: 500,
          enforceOfficeGeofence: true,
        },
      });
    }
    return settings;
  } catch (error) {
    console.error("Error fetching attendance settings:", error);
    return {
      id: "default",
      expectedClockIn: "09:00",
      expectedClockOut: "18:00",
      gracePeriodMinutes: 15,
      halfDayThresholdMinutes: 240,
      maxShiftHoursCap: 16,
      allowOvernightShift: true,
      officeLatitude: null,
      officeLongitude: null,
      officeRadiusMeters: 500,
      enforceOfficeGeofence: true,
    };
  }
}

/**
 * Checks for orphaned open sessions and auto-closes them if open longer than maxShiftHoursCap.
 */
async function processOrphanedSessions(userId: string, settingsInput?: any) {
  try {
    const settings = settingsInput || await getAttendanceSettings();
    const maxHours = settings?.maxShiftHoursCap || 16;
    const cutoffDate = new Date(Date.now() - maxHours * 60 * 60 * 1000);

    const orphanedRecords = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        clockOut: null,
        clockIn: { lte: cutoffDate },
      },
    });

    for (const record of orphanedRecords) {
      const autoClockOut = new Date(record.clockIn.getTime() + maxHours * 60 * 60 * 1000);
      const totalShiftMinutes = maxHours * 60;

      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          clockOut: autoClockOut,
          isAutoCheckedOut: true,
          workMinutes: totalShiftMinutes,
          notes: `${record.notes ? record.notes + " | " : ""}Auto checked-out after ${maxHours} hours cap.`,
        },
      });

      await prisma.attendanceAuditLog.create({
        data: {
          attendanceRecordId: record.id,
          userId,
          action: "AUTO_CHECKOUT",
          oldValues: JSON.stringify({ clockOut: null, isAutoCheckedOut: false }),
          newValues: JSON.stringify({ clockOut: autoClockOut, isAutoCheckedOut: true }),
          reason: `System automatically closed session after reaching ${maxHours}-hour shift cap.`,
        },
      });
    }
  } catch (err) {
    console.error("Failed to process orphaned attendance sessions:", err);
  }
}

export async function clockInAction(input: ClockInInput) {
  try {
    const { session, reqHeaders } = await getAuthenticatedUser();
    const validated = clockInSchema.parse(input);

    // Run auto-checkout check for open orphaned sessions concurrently with settings fetch
    const settings = await getAttendanceSettings();
    processOrphanedSessions(session.user.id, settings).catch(e => console.error(e));

    const today = getTodayDateOnly();

    // One attendance session per day.
    // Breaks are tracked separately in AttendanceBreak rows.
    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: session.user.id,
        date: today,
      },
    });

    if (existingRecord) {
      return {
        success: false,
        error: "You already have an attendance record for today. If you accidentally clocked out, use undo/admin correction instead of re-clock-in.",
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { department: true, workMode: true },
    });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    const rawUserAgent = reqHeaders.get("user-agent") || undefined;
    const ipAddress =
      reqHeaders.get("x-forwarded-for")?.split(",")[0] ||
      reqHeaders.get("x-real-ip") ||
      undefined;

    const parsedUserAgent = userAgent({ headers: reqHeaders });
    const deviceType = parsedUserAgent.device.type || "desktop";
    const osName = parsedUserAgent.os.name || "";
    const browserName = parsedUserAgent.browser.name || "";

    const deviceInfo = `${deviceType.toUpperCase()}${osName ? ` (${osName}${browserName ? ` / ${browserName}` : ""})` : ""}`;

    // Get current time in IST for comparison purposes
    const nowIST = getNowInIST();
    const nowUTC = new Date();

    // Validate Office Location & Distance if workMode is OFFICE
    let distanceFromOffice: number | null = null;
    if (user.workMode === WorkMode.OFFICE) {
      if (settings?.enforceOfficeGeofence && (validated.latitude == null || validated.longitude == null)) {
        return {
          success: false,
          error: "GPS location is required for Office work mode clock-in. Please allow location access.",
        };
      }

      if (
        validated.latitude != null &&
        validated.longitude != null &&
        settings?.officeLatitude != null &&
        settings?.officeLongitude != null
      ) {
        distanceFromOffice = calculateDistanceMeters(
          validated.latitude,
          validated.longitude,
          settings.officeLatitude,
          settings.officeLongitude
        );

        if (settings.enforceOfficeGeofence && distanceFromOffice > settings.officeRadiusMeters) {
          const distanceStr =
            distanceFromOffice >= 1000
              ? `${(distanceFromOffice / 1000).toFixed(2)} km`
              : `${distanceFromOffice} meters`;
          const radiusStr =
            settings.officeRadiusMeters >= 1000
              ? `${(settings.officeRadiusMeters / 1000).toFixed(2)} km`
              : `${settings.officeRadiusMeters} meters`;

          return {
            success: false,
            error: `You are ${distanceStr} away from the office. Office clock-in requires being within ${radiusStr} of office location.`,
          };
        }
      }
    }

    // Shift start cutoff math using IST time
    const [expHour, expMinute] = (settings?.expectedClockIn || "09:00").split(":").map(Number);
    const expectedStartTime = new Date(nowIST);
    expectedStartTime.setHours(expHour, expMinute, 0, 0);

    const graceTime = new Date(expectedStartTime.getTime() + (settings?.gracePeriodMinutes || 15) * 60 * 1000);
    const halfDayTime = new Date(expectedStartTime.getTime() + (settings?.halfDayThresholdMinutes || 240) * 60 * 1000);

    let status: "PRESENT" | "LATE" | "HALF_DAY" = "PRESENT";
    let lateMinutes = 0;

    if (nowIST > graceTime && nowIST <= halfDayTime) {
      status = "LATE";
      lateMinutes = Math.round((nowIST.getTime() - expectedStartTime.getTime()) / (1000 * 60));
    } else if (nowIST > halfDayTime) {
      status = "HALF_DAY";
      lateMinutes = Math.round((nowIST.getTime() - expectedStartTime.getTime()) / (1000 * 60));
    }

    // Normal clock-in: create one record for the day.
    // Breaks are stored separately in AttendanceBreak rows.
    const record = await prisma.attendanceRecord.create({
      data: {
        userId: session.user.id,
        date: today,
        clockIn: nowUTC,
        status,
        workMode: user.workMode,
        department: user?.department,
        ipAddress,
        userAgent: rawUserAgent,
        deviceInfo,
        latitude: validated.latitude ?? null,
        longitude: validated.longitude ?? null,
        distanceFromOffice,
        locationName: validated.locationName ?? null,
        // selfieUrl: validated.selfieUrl ?? null,
        // selfiePublicId: validated.selfiePublicId ?? null,
        notes: validated.notes ?? null,
        lateMinutes,
      },
    });

    // Create Audit Log
    await prisma.attendanceAuditLog.create({
      data: {
        attendanceRecordId: record.id,
        userId: session.user.id,
        action: "CREATE",
        newValues: JSON.stringify({ clockIn: nowUTC, status, workMode: validated.workMode }),
        reason: "Initial Clock-In recorded.",
      },
    });

    return { success: true, record: JSON.parse(JSON.stringify(record)) };
  } catch (error: any) {
    console.error("Error in clockInAction:", error);
    return { success: false, error: error.message || "Failed to clock in" };
  }
}

export async function clockOutAction(input: ClockOutInput) {
  try {
    const { session } = await getAuthenticatedUser();
    const validated = clockOutSchema.parse(input);

    const today = getTodayDateOnly();

    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: session.user.id,
        date: today,
        clockOut: null,
      },
      include: {
        breaks: true,
      },
    });

    if (!activeRecord) {
      return { success: false, error: "No active clock-in session found for today." };
    }

    // End open break if active
    let breakMinutes = activeRecord.breakMinutes;
    const openBreak = activeRecord.breaks.find((b) => !b.breakEnd);
    const nowUTC = new Date();
    const nowIST = getNowInIST();

    if (openBreak) {
      await prisma.attendanceBreak.update({
        where: { id: openBreak.id },
        data: { breakEnd: nowUTC },
      });
      breakMinutes += Math.round((nowUTC.getTime() - openBreak.breakStart.getTime()) / (1000 * 60));
    }

    const settings = await getAttendanceSettings();

    // Early leave & work duration math using IST time
    const [expHour, expMin] = (settings?.expectedClockOut || "18:00").split(":").map(Number);
    const expectedOutTime = new Date(nowIST);
    expectedOutTime.setHours(expHour, expMin, 0, 0);

    const earlyLeave = nowIST < expectedOutTime;
    const earlyLeaveMinutes = earlyLeave
      ? Math.round((expectedOutTime.getTime() - nowIST.getTime()) / (1000 * 60))
      : 0;

    const totalShiftMinutes = Math.round((nowUTC.getTime() - activeRecord.clockIn.getTime()) / (1000 * 60));
    const netWorkMinutes = Math.max(0, totalShiftMinutes - breakMinutes);

    // Evaluate Half-Day status: Minimum 4 hours (240 mins) of work time required
    const minHalfDayMinutes = settings?.halfDayThresholdMinutes || 240;
    let finalStatus = activeRecord.status;
    let halfDayNote = "";
    if (netWorkMinutes < minHalfDayMinutes) {
      finalStatus = "HALF_DAY";
      const hrs = Math.floor(netWorkMinutes / 60);
      const mins = netWorkMinutes % 60;
      halfDayNote = `Shift duration under 4 hours (${hrs}h ${mins}m logged). Marked as Half Day.`;
    }

    // Combine existing notes, user notes, and system half day note
    let updatedNotes = activeRecord.notes || "";
    if (validated.notes) {
      updatedNotes = updatedNotes ? `${updatedNotes} | ${validated.notes}` : validated.notes;
    }
    if (halfDayNote && !updatedNotes.includes("Marked as Half Day")) {
      updatedNotes = updatedNotes ? `${updatedNotes} | ${halfDayNote}` : halfDayNote;
    }

    // Overtime math (if net work minutes exceed 8 hours = 480 mins)
    const overtimeMinutes = Math.max(0, netWorkMinutes - 480);

    const record = await prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        clockOut: nowUTC,
        status: finalStatus,
        earlyLeave,
        earlyLeaveMinutes,
        workMinutes: netWorkMinutes,
        breakMinutes,
        overtimeMinutes,
        notes: updatedNotes || null,
      },
    });

    // Create Audit Log
    await prisma.attendanceAuditLog.create({
      data: {
        attendanceRecordId: record.id,
        userId: session.user.id,
        action: "UPDATE",
        oldValues: JSON.stringify({ clockOut: null }),
        newValues: JSON.stringify({ clockOut: nowUTC, workMinutes: netWorkMinutes, earlyLeaveMinutes }),
        reason: "Shift completed and clocked out.",
      },
    });

    return { success: true, record: JSON.parse(JSON.stringify(record)) };
  } catch (error: any) {
    console.error("Error in clockOutAction:", error);
    return { success: false, error: error.message || "Failed to clock out" };
  }
}

export async function startBreakAction(input: StartBreakInput) {
  try {
    const { session } = await getAuthenticatedUser();
    const validated = startBreakSchema.parse(input);

    const today = getTodayDateOnly();

    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: session.user.id,
        date: today,
        clockOut: null,
      },
      include: {
        breaks: true,
      },
    });

    if (!activeRecord) {
      return { success: false, error: "You must clock in before taking a break." };
    }

    const openBreak = activeRecord.breaks.find((b) => !b.breakEnd);
    if (openBreak) {
      return { success: false, error: "You are already on break." };
    }

    await prisma.attendanceBreak.create({
      data: {
        attendanceRecordId: activeRecord.id,
        breakStart: new Date(),
        type: validated.type,
      },
    });

    const updatedRecord = await prisma.attendanceRecord.findUnique({
      where: {
        id: activeRecord.id,
      },
      include: {
        breaks: true,
      },
    });

    return {
      success: true,
      record: updatedRecord,
    };
  } catch (error: any) {
    console.error("Error in startBreakAction:", error);
    return { success: false, error: error.message || "Failed to start break" };
  }
}

export async function endBreakAction(input: EndBreakInput) {
  try {
    const { session } = await getAuthenticatedUser();
    const validated = endBreakSchema.parse(input);

    const today = getTodayDateOnly();

    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: session.user.id,
        date: today,
        clockOut: null,
      },
      include: {
        breaks: true,
      },
    });

    if (!activeRecord) {
      return { success: false, error: "No active attendance record found." };
    }

    let openBreak = activeRecord.breaks.find((b) => !b.breakEnd);
    if (validated.breakId) {
      openBreak = activeRecord.breaks.find((b) => b.id === validated.breakId && !b.breakEnd);
    }

    if (!openBreak) {
      return { success: false, error: "No active break to end." };
    }

    const now = new Date();
    await prisma.attendanceBreak.update({
      where: { id: openBreak.id },
      data: {
        breakEnd: now,
      },
    });

    // Update cumulative break minutes
    const breakDurationMinutes = Math.round((now.getTime() - openBreak.breakStart.getTime()) / (1000 * 60));
    await prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        breakMinutes: activeRecord.breakMinutes + breakDurationMinutes,
      },
    });

    // 👇 Fetch the latest record
    const updatedRecord = await prisma.attendanceRecord.findUnique({
      where: {
        id: activeRecord.id,
      },
      include: {
        breaks: {
          orderBy: {
            breakStart: "desc",
          }
        }
      },
    });

    // 👇 Return it
    return {
      success: true,
      record: updatedRecord,
    };
  } catch (error: any) {
    console.error("Error in endBreakAction:", error);
    return { success: false, error: error.message || "Failed to end break" };
  }
}

export async function getTodayAttendanceAction() {
  try {
    const { session } = await getAuthenticatedUser();
    if (!session?.user) {
      return { success: false, record: null, settings: null, userRole: "STAFF", error: "Unauthorized" };
    }

    // Auto-checkout orphaned sessions before querying today's record
    await processOrphanedSessions(session.user.id);

    const today = getTodayDateOnly();

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        userId: session.user.id,
        date: today,
      },
      include: {
        breaks: {
          orderBy: { breakStart: "desc" },
        },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { workMode: true },
    });

    const settings = await getAttendanceSettings();

    return {
      success: true,
      record: record ? JSON.parse(JSON.stringify(record)) : null,
      settings: settings ? JSON.parse(JSON.stringify(settings)) : null,
      userRole: (session.user.role as UserRole) || UserRole.STAFF,
      userWorkMode: user?.workMode || WorkMode.OFFICE,
    };
  } catch (error: any) {
    console.error("Error in getTodayAttendanceAction:", error);
    return {
      success: false,
      record: null,
      settings: null,
      userRole: "STAFF",
      error: error.message || "Failed to load today's attendance record",
    };
  }
}

export async function getAttendanceLogsAction(input: Partial<AttendanceFilterInput>) {
  try {
    const { session } = await getAuthenticatedUser();
    const parsed = attendanceFilterSchema.parse(input);

    const isManager = isAttendanceManager(session.user);
    const targetUserId = isManager ? parsed.userId : session.user.id;

    if (targetUserId) {
      await processOrphanedSessions(targetUserId);
    }

    const whereClause: any = {};

    if (targetUserId) {
      whereClause.userId = targetUserId;
    }

    if (parsed.status) {
      whereClause.status = parsed.status;
    }

    if (parsed.department) {
      whereClause.OR = [
        { department: parsed.department },
        { user: { department: parsed.department } },
      ];
    }

    const dateFilter = parseDateRangeFilter(parsed.startDate, parsed.endDate);
    if (dateFilter) {
      whereClause.date = dateFilter;
    }

    const skip = (parsed.page - 1) * parsed.limit;

    const [records, totalCount] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              department: true,
              employeeId: true,
              designation: true,
            },
          },
          breaks: true,
        },
        orderBy: { clockIn: "desc" },
        skip,
        take: parsed.limit,
      }),
      prisma.attendanceRecord.count({ where: whereClause }),
    ]);

    return {
      success: true,
      records: JSON.parse(JSON.stringify(records)),
      totalCount,
      totalPages: Math.ceil(totalCount / parsed.limit),
      currentPage: parsed.page,
    };
  } catch (error: any) {
    console.error("Error in getAttendanceLogsAction:", error);
    return {
      success: false,
      records: [],
      totalCount: 0,
      totalPages: 1,
      currentPage: 1,
      error: error.message || "Failed to fetch attendance logs",
    };
  }
}

export async function getAttendanceAnalyticsAction(filters: {
  startDate?: string;
  endDate?: string;
  department?: string;
  userId?: string;
}) {
  try {
    const { session } = await getAuthenticatedUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, department: true },
    });
    const effectiveUser = dbUser || session.user;
    const isManager = isAttendanceManager(effectiveUser);

    const conditions: any[] = [];

    if (!isManager) {
      conditions.push({ userId: effectiveUser.id });
    } else if (filters.userId && filters.userId !== "ALL") {
      conditions.push({ userId: filters.userId });
    }

    if (filters.department && filters.department !== "ALL") {
      conditions.push({
        OR: [
          { department: filters.department as Department },
          { user: { department: filters.department as Department } },
        ],
      });
    }

    const dateFilter = parseDateRangeFilter(filters.startDate, filters.endDate);
    if (dateFilter) {
      conditions.push({ date: dateFilter });
    }

    const whereClause = conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { AND: conditions };

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            email: true,
            department: true,
            image: true,
          },
        },
        breaks: true,
      },
      orderBy: { date: "asc" },
    });

    let totalShifts = records.length;
    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let totalWorkMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalLateMinutes = 0;
    let earlyLeaveCount = 0;
    let autoCheckedOutCount = 0;
    let regularizedCount = 0;

    const chartMap: Record<string, {
      date: string;
      dateLabel: string;
      present: number;
      late: number;
      halfDay: number;
      absent: number;
      hours: number;
      overtimeHours: number;
    }> = {};

    const deptMap: Record<string, { total: number; onTime: number; minutes: number }> = {};
    const workModeMap: Record<string, number> = { OFFICE: 0, REMOTE: 0, HYBRID: 0 };
    const dayOfWeekMap: Record<number, { onTime: number; late: number }> = {
      1: { onTime: 0, late: 0 }, // Mon
      2: { onTime: 0, late: 0 }, // Tue
      3: { onTime: 0, late: 0 }, // Wed
      4: { onTime: 0, late: 0 }, // Thu
      5: { onTime: 0, late: 0 }, // Fri
      6: { onTime: 0, late: 0 }, // Sat
    };

    const employeeAgg: Record<string, {
      name: string;
      email: string;
      employeeId: string;
      image?: string | null;
      department: string;
      shifts: number;
      onTime: number;
      overtimeMinutes: number;
    }> = {};

    for (const rec of records) {
      if (rec.status === "PRESENT") presentCount++;
      else if (rec.status === "LATE") {
        lateCount++;
        totalLateMinutes += rec.lateMinutes || 0;
      }
      else if (rec.status === "HALF_DAY") halfDayCount++;
      else if (rec.status === "ABSENT") absentCount++;

      if (rec.earlyLeave) earlyLeaveCount++;
      if (rec.isAutoCheckedOut) autoCheckedOutCount++;
      if (rec.regularized) regularizedCount++;

      totalWorkMinutes += rec.workMinutes || 0;
      totalBreakMinutes += rec.breakMinutes || 0;
      totalOvertimeMinutes += rec.overtimeMinutes || 0;

      // Work mode counts
      if (rec.workMode) {
        workModeMap[rec.workMode] = (workModeMap[rec.workMode] || 0) + 1;
      }

      // Department breakdown
      const deptName = rec.department || rec.user?.department || "General";
      if (!deptMap[deptName]) {
        deptMap[deptName] = { total: 0, onTime: 0, minutes: 0 };
      }
      deptMap[deptName].total++;
      if (rec.status === "PRESENT") deptMap[deptName].onTime++;
      deptMap[deptName].minutes += rec.workMinutes || 0;

      // Day of week
      const d = new Date(rec.date);
      const dayNum = d.getDay();
      if (dayOfWeekMap[dayNum]) {
        if (rec.status === "LATE") {
          dayOfWeekMap[dayNum].late++;
        } else if (rec.status === "PRESENT") {
          dayOfWeekMap[dayNum].onTime++;
        }
      }

      // Time series grouping
      const dateKey = d.toISOString().split("T")[0];
      if (!chartMap[dateKey]) {
        chartMap[dateKey] = {
          date: dateKey,
          dateLabel: formatInIST(d, "dd MMM"),
          present: 0,
          late: 0,
          halfDay: 0,
          absent: 0,
          hours: 0,
          overtimeHours: 0,
        };
      }

      if (rec.status === "PRESENT") chartMap[dateKey].present++;
      else if (rec.status === "LATE") chartMap[dateKey].late++;
      else if (rec.status === "HALF_DAY") chartMap[dateKey].halfDay++;
      else if (rec.status === "ABSENT") chartMap[dateKey].absent++;

      chartMap[dateKey].hours += Math.round(((rec.workMinutes || 0) / 60) * 10) / 10;
      chartMap[dateKey].overtimeHours += Math.round(((rec.overtimeMinutes || 0) / 60) * 10) / 10;

      // Per Employee Aggregation
      const uId = rec.userId;
      if (!employeeAgg[uId]) {
        employeeAgg[uId] = {
          name: rec.user?.name || "Unknown",
          email: rec.user?.email || "",
          employeeId: rec.user?.employeeId ? `${env.NEXT_PUBLIC_EMP_PREFIX}${String(rec.user.employeeId).padStart(3, "0")}` : "N/A",
          image: rec.user?.image,
          department: deptName,
          shifts: 0,
          onTime: 0,
          overtimeMinutes: 0,
        };
      }
      employeeAgg[uId].shifts++;
      if (rec.status === "PRESENT") employeeAgg[uId].onTime++;
      employeeAgg[uId].overtimeMinutes += rec.overtimeMinutes || 0;
    }

    const punctualityRate = totalShifts > 0 ? Math.round((presentCount / totalShifts) * 100) : 100;
    const avgWorkHoursPerDay = totalShifts > 0 ? Number((totalWorkMinutes / (60 * totalShifts)).toFixed(1)) : 0;
    const timeSeriesData = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date));

    // Department Breakdown
    const departmentBreakdown = Object.entries(deptMap).map(([dept, d]) => ({
      department: dept,
      shifts: d.total,
      punctualityRate: d.total > 0 ? Math.round((d.onTime / d.total) * 100) : 100,
      totalHours: Number((d.minutes / 60).toFixed(1)),
    }));

    // Work Mode Distribution
    const workModeDistribution = [
      { name: "Office", value: workModeMap.OFFICE || 0, color: "#10b981" },
      { name: "Remote", value: workModeMap.REMOTE || 0, color: "#3b82f6" },
      { name: "Hybrid", value: workModeMap.HYBRID || 0, color: "#a855f7" },
    ].filter((m) => m.value > 0);

    // Day of Week Distribution
    const dayNames: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
    const dayOfWeekStats = [1, 2, 3, 4, 5, 6].map((dayNum) => {
      const s = dayOfWeekMap[dayNum] || { onTime: 0, late: 0 };
      const total = s.onTime + s.late;
      return {
        day: dayNames[dayNum],
        onTime: s.onTime,
        late: s.late,
        punctualityRate: total > 0 ? Math.round((s.onTime / total) * 100) : 100,
      };
    });

    // Top Punctual and Overtime Performers
    const allEmps = Object.values(employeeAgg);
    const topPunctual = [...allEmps]
      .filter((e) => e.shifts >= 3)
      .sort((a, b) => (b.onTime / b.shifts) - (a.onTime / a.shifts))
      .slice(0, 5)
      .map((e) => ({
        ...e,
        punctualityRate: Math.round((e.onTime / e.shifts) * 100),
      }));

    const topOvertime = [...allEmps]
      .filter((e) => e.overtimeMinutes > 0)
      .sort((a, b) => b.overtimeMinutes - a.overtimeMinutes)
      .slice(0, 5)
      .map((e) => ({
        ...e,
        overtimeHours: Number((e.overtimeMinutes / 60).toFixed(1)),
      }));

    return {
      success: true,
      summary: {
        totalShifts,
        presentCount,
        lateCount,
        halfDayCount,
        absentCount,
        totalWorkHours: Number((totalWorkMinutes / 60).toFixed(1)),
        avgWorkHoursPerDay,
        totalOvertimeHours: Number((totalOvertimeMinutes / 60).toFixed(1)),
        totalBreakHours: Number((totalBreakMinutes / 60).toFixed(1)),
        totalLateMinutes,
        punctualityRate,
        earlyLeaveCount,
        autoCheckedOutCount,
        regularizedCount,
      },
      timeSeriesData,
      departmentBreakdown,
      workModeDistribution,
      dayOfWeekStats,
      topPunctual,
      topOvertime,
    };
  } catch (error: any) {
    console.error("Error in getAttendanceAnalyticsAction:", error);
    return {
      success: false,
      summary: null,
      timeSeriesData: [],
      departmentBreakdown: [],
      workModeDistribution: [],
      dayOfWeekStats: [],
      topPunctual: [],
      topOvertime: [],
      error: error.message || "Failed to fetch analytics",
    };
  }
}

export async function regularizeAttendanceAction(input: RegularizeAttendanceInput) {
  try {
    const { session } = await getAuthenticatedUser();
    const validated = regularizeAttendanceSchema.parse(input);

    const record = await prisma.attendanceRecord.findUnique({
      where: { id: validated.attendanceRecordId },
    });

    if (!record) {
      return { success: false, error: "Attendance record not found." };
    }

    // Role check: Only ADMIN and SUPER_ADMIN can regularize / edit attendance records
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.SUPER_ADMIN) {
      return { success: false, error: "Only administrators can edit or regularize attendance records." };
    }

    const newClockIn = new Date(validated.clockIn);
    const newClockOut = validated.clockOut ? new Date(validated.clockOut) : null;

    let workMinutes = 0;
    if (newClockIn && newClockOut) {
      workMinutes = Math.max(0, Math.round((newClockOut.getTime() - newClockIn.getTime()) / (1000 * 60)) - record.breakMinutes);
    }

    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockIn: newClockIn,
        clockOut: newClockOut,
        workMinutes,
        regularized: true,
        regularizedBy: session.user.id,
        regularizationReason: validated.reason,
        notes: `${record.notes ? record.notes + " | " : ""}Regularized: ${validated.reason}`,
      },
    });

    // Create Audit Log
    await prisma.attendanceAuditLog.create({
      data: {
        attendanceRecordId: record.id,
        userId: session.user.id,
        action: "REGULARIZE",
        oldValues: JSON.stringify({ clockIn: record.clockIn, clockOut: record.clockOut }),
        newValues: JSON.stringify({ clockIn: newClockIn, clockOut: newClockOut, workMinutes }),
        reason: validated.reason,
      },
    });

    return { success: true, record: JSON.parse(JSON.stringify(updatedRecord)) };
  } catch (error: any) {
    console.error("Error in regularizeAttendanceAction:", error);
    return { success: false, error: error.message || "Failed to regularize attendance" };
  }
}

export async function getAttendanceAuditLogsAction(attendanceRecordId: string) {
  try {
    const { session } = await getAuthenticatedUser();

    const record = await prisma.attendanceRecord.findUnique({
      where: { id: attendanceRecordId },
      select: { userId: true },
    });

    if (!record) {
      return { success: false, logs: [], error: "Attendance record not found." };
    }

    const isStaff = session.user.role === UserRole.STAFF;
    if (isStaff && record.userId !== session.user.id) {
      return { success: false, logs: [], error: "You can only view audit logs for your own attendance record." };
    }

    const logs = await prisma.attendanceAuditLog.findMany({
      where: { attendanceRecordId },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, logs: JSON.parse(JSON.stringify(logs)) };
  } catch (error: any) {
    console.error("Error in getAttendanceAuditLogsAction:", error);
    return { success: false, logs: [], error: error.message || "Failed to fetch audit logs" };
  }
}

export async function updateAttendanceSettingsAction(input: UpdateAttendanceSettingsInput) {
  try {
    const { session } = await getAuthenticatedUser();

    if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN) {
      return { success: false, error: "Only admins can update attendance settings." };
    }

    const validated = updateAttendanceSettingsSchema.parse(input);
    const existing = await prisma.attendanceSettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.attendanceSettings.update({
        where: { id: existing.id },
        data: validated,
      });
    } else {
      settings = await prisma.attendanceSettings.create({
        data: validated,
      });
    }

    return { success: true, settings: JSON.parse(JSON.stringify(settings)) };
  } catch (error: any) {
    console.error("Error updating attendance settings:", error);
    return { success: false, error: error.message || "Failed to update settings" };
  }
}

export async function editAttendanceAction(input: EditAttendanceInput) {
  try {
    const { session } = await getAuthenticatedUser();
    const validated = editAttendanceSchema.parse(input);

    const record = await prisma.attendanceRecord.findUnique({
      where: { id: validated.attendanceRecordId },
    });

    if (!record) {
      return { success: false, error: "Attendance record not found." };
    }

    const isSuperAdmin = session.user.role === UserRole.SUPER_ADMIN;
    const isAdmin = session.user.role === UserRole.ADMIN;
    const isHrStaff = session.user.role === UserRole.STAFF && session.user.department === 'HR';

    if (!isSuperAdmin && !isAdmin && !isHrStaff) {
      return { success: false, error: "Only admins or HR staff can edit attendance records." };
    }

    const newClockIn = new Date(validated.clockIn);
    const newClockOut = validated.clockOut ? new Date(validated.clockOut) : null;
    const newStatus = validated.status || record.status;

    let workMinutes = 0;
    if (newClockIn && newClockOut) {
      workMinutes = Math.max(0, Math.round((newClockOut.getTime() - newClockIn.getTime()) / (1000 * 60)) - record.breakMinutes);
    }

    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockIn: newClockIn,
        clockOut: newClockOut,
        status: newStatus,
        workMinutes,
        isManuallyEdited: true,
        notes: `${record.notes ? record.notes + " | " : ""}Edited: ${validated.reason}`,
      },
    });

    // Create Audit Log with editor details
    await prisma.attendanceAuditLog.create({
      data: {
        attendanceRecordId: record.id,
        userId: record.userId, // The person whose record it is
        editorId: session.user.id,
        editorRole: session.user.role,
        action: "UPDATE",
        oldValues: JSON.stringify({ clockIn: record.clockIn, clockOut: record.clockOut, status: record.status }),
        newValues: JSON.stringify({ clockIn: newClockIn, clockOut: newClockOut, status: newStatus, workMinutes }),
        reason: validated.reason,
      },
    });

    return { success: true, record: JSON.parse(JSON.stringify(updatedRecord)) };
  } catch (error: any) {
    console.error("Error in editAttendanceAction:", error);
    return { success: false, error: error.message || "Failed to edit attendance" };
  }
}

function buildAdvancedAttendanceWhereClause(sessionUser: any, parsed: AdvancedAttendanceReportInput) {
  const isManager = isAttendanceManager(sessionUser);
  const conditions: any[] = [];

  if (!isManager) {
    conditions.push({ userId: sessionUser.id });
  } else if (parsed.userId && parsed.userId !== "ALL") {
    conditions.push({ userId: parsed.userId });
  }

  if (parsed.department && (parsed.department as string) !== "ALL") {
    conditions.push({
      OR: [
        { department: parsed.department },
        { user: { department: parsed.department } },
      ],
    });
  }

  if (parsed.workMode && (parsed.workMode as string) !== "ALL") {
    conditions.push({ workMode: parsed.workMode });
  }

  if (parsed.status && (parsed.status as string) !== "ALL") {
    conditions.push({ status: parsed.status });
  }

  const dateFilter = parseDateRangeFilter(parsed.startDate, parsed.endDate);
  if (dateFilter) {
    conditions.push({ date: dateFilter });
  }

  if (parsed.onlyLate) {
    conditions.push({
      lateMinutes: { gt: parsed.minLateMinutes !== undefined ? parsed.minLateMinutes : 0 },
    });
  } else if (parsed.minLateMinutes !== undefined && parsed.minLateMinutes > 0) {
    conditions.push({ lateMinutes: { gte: parsed.minLateMinutes } });
  }

  if (parsed.onlyEarlyLeave) {
    conditions.push({ earlyLeave: true });
  }

  if (parsed.onlyOvertime) {
    conditions.push({ overtimeMinutes: { gt: 0 } });
  }

  if (parsed.onlyAutoCheckedOut) {
    conditions.push({ isAutoCheckedOut: true });
  }

  if (parsed.onlyRegularized) {
    conditions.push({ regularized: true });
  }

  if (parsed.onlyManuallyEdited) {
    conditions.push({ isManuallyEdited: true });
  }

  if (parsed.minWorkMinutes !== undefined || parsed.maxWorkMinutes !== undefined) {
    const wmFilter: any = {};
    if (parsed.minWorkMinutes !== undefined) wmFilter.gte = parsed.minWorkMinutes;
    if (parsed.maxWorkMinutes !== undefined) wmFilter.lte = parsed.maxWorkMinutes;
    conditions.push({ workMinutes: wmFilter });
  }

  if (parsed.onlyExcessiveBreaks) {
    conditions.push({
      breakMinutes: { gt: parsed.minBreakMinutes !== undefined ? parsed.minBreakMinutes : 60 },
    });
  }

  if (parsed.geofenceFilter === "IN_OFFICE") {
    conditions.push({ distanceFromOffice: { not: null, lte: 500 } });
  } else if (parsed.geofenceFilter === "OUTSIDE_OR_REMOTE") {
    conditions.push({
      OR: [
        { workMode: WorkMode.REMOTE },
        { distanceFromOffice: { gt: 500 } },
        { distanceFromOffice: null },
      ],
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

export async function getAttendanceEmployeesListAction() {
  try {
    const { session } = await getAuthenticatedUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, department: true },
    });
    const effectiveUser = dbUser || session.user;
    if (!isAttendanceManager(effectiveUser)) {
      return { success: false, users: [], error: "Unauthorized" };
    }

    const users = await prisma.user.findMany({
      where: { banned: false },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        department: true,
        designation: true,
        workMode: true,
      },
      orderBy: { name: "asc" },
    });

    const formattedUsers = users.map((u) => ({
      ...u,
      employeeId: u.employeeId ? `${env.NEXT_PUBLIC_EMP_PREFIX}${String(u.employeeId).padStart(3, "0")}` : null,
    }));

    return { success: true, users: JSON.parse(JSON.stringify(formattedUsers)) };
  } catch (error: any) {
    console.error("Error in getAttendanceEmployeesListAction:", error);
    return { success: false, users: [], error: error.message || "Failed to fetch employees" };
  }
}

export async function getDetailedAttendanceReportAction(input: Partial<AdvancedAttendanceReportInput>) {
  try {
    const { session } = await getAuthenticatedUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, department: true },
    });
    const effectiveUser = dbUser || session.user;
    if (!isAttendanceManager(effectiveUser)) {
      throw new Error("Unauthorized: Only Admins and HR staff can access Detailed Attendance Reports.");
    }

    const parsed = advancedAttendanceReportSchema.parse(input);
    const whereClause = buildAdvancedAttendanceWhereClause(effectiveUser, parsed);

    const skip = (parsed.page - 1) * parsed.limit;

    // Fetch paginated records & full count & aggregate overview in parallel
    const [records, totalCount, allMatchingRecords] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              employeeId: true,
              name: true,
              email: true,
              image: true,
              department: true,
              designation: true,
            },
          },
          breaks: {
            orderBy: { breakStart: "asc" },
          },
          auditLogs: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [{ date: "desc" }, { clockIn: "desc" }],
        skip,
        take: parsed.limit,
      }),
      prisma.attendanceRecord.count({ where: whereClause }),
      prisma.attendanceRecord.findMany({
        where: whereClause,
        select: {
          status: true,
          workMinutes: true,
          breakMinutes: true,
          overtimeMinutes: true,
          lateMinutes: true,
          earlyLeave: true,
          isAutoCheckedOut: true,
          regularized: true,
          department: true,
          workMode: true,
        },
      }),
    ]);

    let totalWorkMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalLateMinutes = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let autoCheckedOutCount = 0;
    let regularizedCount = 0;

    const statusCounts: Record<string, number> = {
      PRESENT: 0,
      LATE: 0,
      HALF_DAY: 0,
      ABSENT: 0,
    };

    const departmentCounts: Record<string, number> = {};
    const workModeCounts: Record<string, number> = {
      OFFICE: 0,
      REMOTE: 0,
      HYBRID: 0,
    };

    allMatchingRecords.forEach((rec) => {
      totalWorkMinutes += rec.workMinutes || 0;
      totalBreakMinutes += rec.breakMinutes || 0;
      totalOvertimeMinutes += rec.overtimeMinutes || 0;

      if (rec.lateMinutes && rec.lateMinutes > 0) {
        totalLateMinutes += rec.lateMinutes;
        lateCount += 1;
      }
      if (rec.earlyLeave) earlyLeaveCount += 1;
      if (rec.isAutoCheckedOut) autoCheckedOutCount += 1;
      if (rec.regularized) regularizedCount += 1;

      if (rec.status) {
        statusCounts[rec.status] = (statusCounts[rec.status] || 0) + 1;
      }

      if (rec.department) {
        departmentCounts[rec.department] = (departmentCounts[rec.department] || 0) + 1;
      }

      if (rec.workMode) {
        workModeCounts[rec.workMode] = (workModeCounts[rec.workMode] || 0) + 1;
      }
    });

    const totalRecords = allMatchingRecords.length;
    const punctualityRate = totalRecords > 0 ? Math.round(((totalRecords - lateCount) / totalRecords) * 100) : 100;
    const avgWorkHoursPerDay = totalRecords > 0 ? Number((totalWorkMinutes / (60 * totalRecords)).toFixed(1)) : 0;

    const summary = {
      totalRecords,
      totalWorkHours: Number((totalWorkMinutes / 60).toFixed(1)),
      totalBreakHours: Number((totalBreakMinutes / 60).toFixed(1)),
      totalOvertimeHours: Number((totalOvertimeMinutes / 60).toFixed(1)),
      punctualityRate,
      avgWorkHoursPerDay,
      lateCount,
      totalLateMinutes,
      earlyLeaveCount,
      autoCheckedOutCount,
      regularizedCount,
      statusCounts,
      departmentCounts,
      workModeCounts,
    };

    return {
      success: true,
      records: JSON.parse(JSON.stringify(records)),
      totalCount,
      totalPages: Math.ceil(totalCount / parsed.limit),
      currentPage: parsed.page,
      summary,
    };
  } catch (error: any) {
    console.error("Error in getDetailedAttendanceReportAction:", error);
    return {
      success: false,
      records: [],
      totalCount: 0,
      totalPages: 1,
      currentPage: 1,
      summary: null,
      error: error.message || "Failed to generate detailed attendance report",
    };
  }
}

export async function exportAttendanceToExcelAction(input: Partial<AdvancedAttendanceReportInput>) {
  try {
    const { session } = await getAuthenticatedUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, department: true },
    });
    const effectiveUser = dbUser || session.user;
    if (!isAttendanceManager(effectiveUser)) {
      throw new Error("Unauthorized: Only Admins, Super Admins, and HR Department staff can export attendance reports.");
    }

    const parsed = advancedAttendanceReportSchema.parse(input);
    const whereClause = buildAdvancedAttendanceWhereClause(effectiveUser, parsed);

    // Fetch all matching records without pagination limit
    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            email: true,
            department: true,
            designation: true,
          },
        },
        breaks: {
          orderBy: { breakStart: "asc" },
        },
      },
      orderBy: [{ date: "desc" }, { clockIn: "desc" }],
    });

    if (!records || records.length === 0) {
      return { success: false, error: "No attendance records found matching the specified filters." };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = `${env.NEXT_PUBLIC_APP_NAME} Attendance Engine`;
    workbook.created = new Date();

    // ==========================================
    // SHEET 1: Detailed Attendance Records
    // ==========================================
    const sheet1 = workbook.addWorksheet("Detailed Attendance", {
      views: [{ showGridLines: true }],
    });

    // 1. Report Header Banner
    sheet1.mergeCells("A1:S1");
    const titleCell = sheet1.getCell("A1");
    titleCell.value = "DETAILED ATTENDANCE REPORT";
    titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // Slate 900
    };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet1.getRow(1).height = 36;

    // 2. Metadata / Filters Banner
    sheet1.mergeCells("A2:S2");
    const metaCell = sheet1.getCell("A2");
    const dateRangeStr = parsed.startDate && parsed.endDate
      ? `${parsed.startDate} to ${parsed.endDate}`
      : parsed.startDate
      ? `From ${parsed.startDate}`
      : parsed.endDate
      ? `Up to ${parsed.endDate}`
      : "All Dates";
    const deptStr = parsed.department ? `Department: ${parsed.department}` : "All Departments";
    const userStr = parsed.userId ? `Specific Employee Filtered` : "All Employees";
    metaCell.value = `Generated: ${formatInIST(new Date(), "dd MMM yyyy, hh:mm a")} IST | Date Range: ${dateRangeStr} | ${deptStr} | ${userStr} | Total Records: ${records.length}`;
    metaCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF475569" } };
    metaCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" }, // Slate 100
    };
    metaCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet1.getRow(2).height = 22;

    sheet1.addRow([]); // Blank spacer

    // 3. Table Column Headers
    const headers = [
      "Sl No",
      "Date",
      "Employee ID",
      "Employee Name",
      "Email",
      "Department",
      "Work Mode",
      "Status",
      "Clock In (IST)",
      "Clock Out (IST)",
      "Gross Work",
      "Break (Mins)",
      "Net Work Hours",
      "Late (Mins)",
      "Early Leave",
      "Overtime (Mins)",
      "Regularized",
      "Office Distance",
      "Notes",
    ];

    const headerRow = sheet1.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0284C7" }, // Sky 600
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "medium", color: { argb: "FF0369A1" } },
      };
    });

    // 4. Data Rows
    let totalWorkMinsSum = 0;
    let totalBreakMinsSum = 0;
    let totalLateMinsSum = 0;
    let totalOvertimeMinsSum = 0;

    records.forEach((rec, idx) => {
      const clockInStr = rec.clockIn ? formatInIST(new Date(rec.clockIn), "hh:mm a") : "-";
      const clockOutStr = rec.clockOut ? formatInIST(new Date(rec.clockOut), "hh:mm a") : rec.isAutoCheckedOut ? "Auto-Closed" : "Active";
      const grossMins = rec.clockIn && rec.clockOut ? Math.max(0, Math.round((new Date(rec.clockOut).getTime() - new Date(rec.clockIn).getTime()) / (1000 * 60))) : 0;
      const netHoursStr = rec.workMinutes > 0 ? `${Math.floor(rec.workMinutes / 60)}h ${rec.workMinutes % 60}m` : "-";
      const grossHoursStr = grossMins > 0 ? `${Math.floor(grossMins / 60)}h ${grossMins % 60}m` : "-";
      const dateFormatted = rec.date ? formatInIST(new Date(rec.date), "dd/MM/yyyy") : "-";
      const resolvedEmpNo = rec.user?.employeeId ? `${env.NEXT_PUBLIC_EMP_PREFIX}${String(rec.user.employeeId).padStart(3, "0")}` : "N/A";

      totalWorkMinsSum += rec.workMinutes || 0;
      totalBreakMinsSum += rec.breakMinutes || 0;
      totalLateMinsSum += rec.lateMinutes || 0;
      totalOvertimeMinsSum += rec.overtimeMinutes || 0;

      const row = sheet1.addRow([
        idx + 1,
        dateFormatted,
        resolvedEmpNo,
        rec.user?.name || "N/A",
        rec.user?.email || "N/A",
        rec.department || rec.user?.department || "N/A",
        rec.workMode,
        rec.status,
        clockInStr,
        clockOutStr,
        grossHoursStr,
        rec.breakMinutes || 0,
        netHoursStr,
        rec.lateMinutes || 0,
        rec.earlyLeave ? "Yes" : "No",
        rec.overtimeMinutes || 0,
        rec.regularized ? `Yes (${rec.regularizationReason || "Approved"})` : "No",
        rec.distanceFromOffice !== null && rec.distanceFromOffice !== undefined ? `${rec.distanceFromOffice}m` : rec.workMode === "REMOTE" ? "Remote" : "N/A",
        rec.notes || "",
      ]);

      row.height = 20;

      const isEven = idx % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Segoe UI", size: 9 };
        if (isEven) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };

        if ([1, 2, 3, 7, 8, 9, 10, 12, 14, 15, 16, 17, 18].includes(colNumber)) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }

        if (colNumber === 8) {
          if (rec.status === "PRESENT") {
            cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF059669" } };
          } else if (rec.status === "LATE") {
            cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFDC2626" } };
          } else if (rec.status === "HALF_DAY") {
            cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFD97706" } };
          }
        }
      });
    });

    // 5. Total Summary Row
    sheet1.addRow([]);
    const summaryRow = sheet1.addRow([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totalBreakMinsSum,
      `${Math.floor(totalWorkMinsSum / 60)}h ${totalWorkMinsSum % 60}m`,
      totalLateMinsSum,
      "",
      totalOvertimeMinsSum,
      "",
      "",
      "",
    ]);
    summaryRow.height = 24;
    summaryRow.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF0F172A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FF0F172A" } },
        bottom: { style: "double", color: { argb: "FF0F172A" } },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Explicit Column Widths for Sheet 1
    const sheet1Widths = [8, 14, 16, 22, 26, 16, 14, 14, 16, 16, 14, 14, 16, 14, 14, 16, 18, 16, 24];
    sheet1Widths.forEach((w, i) => {
      sheet1.getColumn(i + 1).width = w;
    });

    // ==========================================
    // SHEET 2: Employee Summary Matrix
    // ==========================================
    const sheet2 = workbook.addWorksheet("Employee Summary", {
      views: [{ showGridLines: true }],
    });

    sheet2.mergeCells("A1:L1");
    const summaryTitle = sheet2.getCell("A1");
    summaryTitle.value = "EMPLOYEE ATTENDANCE SUMMARY MATRIX";
    summaryTitle.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    summaryTitle.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    summaryTitle.alignment = { vertical: "middle", horizontal: "center" };
    sheet2.getRow(1).height = 32;

    sheet2.addRow([]);

    const empHeaders = [
      "Sl No",
      "Employee ID",
      "Employee Name",
      "Email",
      "Department",
      "Total Shifts",
      "Present Count",
      "Late Count",
      "Half Day Count",
      "Total Net Work (Hours)",
      "Total Overtime (Hours)",
      "Avg Daily Hours",
    ];

    const empHeaderRow = sheet2.addRow(empHeaders);
    empHeaderRow.height = 24;
    empHeaderRow.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF059669" }, // Emerald 600
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF047857" } },
      };
    });

    // Group records by employee
    const employeeMap = new Map<string, {
      id: string;
      employeeId: string;
      name: string;
      email: string;
      department: string;
      totalShifts: number;
      presentCount: number;
      lateCount: number;
      halfDayCount: number;
      totalWorkMinutes: number;
      totalOvertimeMinutes: number;
    }>();

    records.forEach((rec) => {
      const uId = rec.userId;
      if (!employeeMap.has(uId)) {
        const empNo = rec.user?.employeeId ? `${env.NEXT_PUBLIC_EMP_PREFIX}${String(rec.user.employeeId).padStart(3, "0")}` : "N/A";
        employeeMap.set(uId, {
          id: uId,
          employeeId: empNo,
          name: rec.user?.name || "Unknown",
          email: rec.user?.email || "Unknown",
          department: rec.department || rec.user?.department || "N/A",
          totalShifts: 0,
          presentCount: 0,
          lateCount: 0,
          halfDayCount: 0,
          totalWorkMinutes: 0,
          totalOvertimeMinutes: 0,
        });
      }

      const emp = employeeMap.get(uId)!;
      emp.totalShifts += 1;
      if (rec.status === "PRESENT") emp.presentCount += 1;
      if (rec.status === "LATE" || (rec.lateMinutes && rec.lateMinutes > 0)) emp.lateCount += 1;
      if (rec.status === "HALF_DAY") emp.halfDayCount += 1;
      emp.totalWorkMinutes += rec.workMinutes || 0;
      emp.totalOvertimeMinutes += rec.overtimeMinutes || 0;
    });

    Array.from(employeeMap.values()).forEach((emp, idx) => {
      const totalHours = Number((emp.totalWorkMinutes / 60).toFixed(1));
      const overtimeHours = Number((emp.totalOvertimeMinutes / 60).toFixed(1));
      const avgHours = emp.totalShifts > 0 ? Number((emp.totalWorkMinutes / (60 * emp.totalShifts)).toFixed(1)) : 0;

      const row = sheet2.addRow([
        idx + 1,
        emp.employeeId,
        emp.name,
        emp.email,
        emp.department,
        emp.totalShifts,
        emp.presentCount,
        emp.lateCount,
        emp.halfDayCount,
        totalHours,
        overtimeHours,
        avgHours,
      ]);

      row.height = 20;
      const isEven = idx % 2 === 0;
      row.eachCell((cell, colNum) => {
        cell.font = { name: "Segoe UI", size: 9 };
        if (isEven) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
        cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
        if ([1, 2, 6, 7, 8, 9, 10, 11, 12].includes(colNum)) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
    });

    // Explicit Column Widths for Sheet 2
    const sheet2Widths = [8, 16, 22, 26, 16, 14, 14, 14, 16, 22, 22, 18];
    sheet2Widths.forEach((w, i) => {
      sheet2.getColumn(i + 1).width = w;
    });

    // Write to Buffer & return base64
    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const dateSlug = formatInIST(new Date(), "yyyy-MM-dd_HHmm");
    const filename = `Attendance_Report_${dateSlug}.xlsx`;

    return {
      success: true,
      base64,
      filename,
      totalExported: records.length,
    };
  } catch (error: any) {
    console.error("Error in exportAttendanceToExcelAction:", error);
    return {
      success: false,
      error: error.message || "Failed to export attendance report to Excel",
    };
  }
}

