"use server";

import { UserRole, WorkMode } from "@/app/generated/prisma/enums";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
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
} from "@/lib/schemas/attendance-schema";
import { headers } from "next/headers";

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
  const d = new Date(dateInput);
  d.setUTCHours(0, 0, 0, 0);
  return d;
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

    // Prevent duplicate clock-ins for today
    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: session.user.id,
        date: today,
      },
    });

    if (existingRecord) {
      return { success: false, error: "You have already clocked in for today." };
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

    const now = new Date();

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

    // Shift start cutoff math
    const [expHour, expMinute] = (settings?.expectedClockIn || "09:00").split(":").map(Number);
    const expectedStartTime = new Date(now);
    expectedStartTime.setHours(expHour, expMinute, 0, 0);

    const graceTime = new Date(expectedStartTime.getTime() + (settings?.gracePeriodMinutes || 15) * 60 * 1000);
    const halfDayTime = new Date(expectedStartTime.getTime() + (settings?.halfDayThresholdMinutes || 240) * 60 * 1000);

    let status: "PRESENT" | "LATE" | "HALF_DAY" = "PRESENT";
    let lateMinutes = 0;

    if (now > graceTime && now <= halfDayTime) {
      status = "LATE";
      lateMinutes = Math.round((now.getTime() - expectedStartTime.getTime()) / (1000 * 60));
    } else if (now > halfDayTime) {
      status = "HALF_DAY";
      lateMinutes = Math.round((now.getTime() - expectedStartTime.getTime()) / (1000 * 60));
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        userId: session.user.id,
        date: today,
        clockIn: now,
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
        selfieUrl: validated.selfieUrl ?? null,
        selfiePublicId: validated.selfiePublicId ?? null,
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
        newValues: JSON.stringify({ clockIn: now, status, workMode: validated.workMode }),
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
    const now = new Date();

    if (openBreak) {
      await prisma.attendanceBreak.update({
        where: { id: openBreak.id },
        data: { breakEnd: now },
      });
      breakMinutes += Math.round((now.getTime() - openBreak.breakStart.getTime()) / (1000 * 60));
    }

    const settings = await getAttendanceSettings();

    // Early leave & work duration math
    const [expHour, expMin] = (settings?.expectedClockOut || "18:00").split(":").map(Number);
    const expectedOutTime = new Date(now);
    expectedOutTime.setHours(expHour, expMin, 0, 0);

    const earlyLeave = now < expectedOutTime;
    const earlyLeaveMinutes = earlyLeave
      ? Math.round((expectedOutTime.getTime() - now.getTime()) / (1000 * 60))
      : 0;

    const totalShiftMinutes = Math.round((now.getTime() - activeRecord.clockIn.getTime()) / (1000 * 60));
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
        clockOut: now,
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
        newValues: JSON.stringify({ clockOut: now, workMinutes: netWorkMinutes, earlyLeaveMinutes }),
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

    // Auto-checkout orphaned sessions first (run asynchronously so it doesn't block loading the screen)
    processOrphanedSessions(session.user.id).catch(e => console.error("Error running deferred orphaned session check", e));

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

    const isStaff = session.user.role === UserRole.STAFF;
    const targetUserId = isStaff ? session.user.id : parsed.userId;

    const whereClause: any = {};

    if (targetUserId) {
      whereClause.userId = targetUserId;
    }

    if (parsed.status) {
      whereClause.status = parsed.status;
    }

    if (parsed.department) {
      whereClause.department = parsed.department;
    }

    if (parsed.startDate || parsed.endDate) {
      whereClause.date = {};
      if (parsed.startDate) {
        whereClause.date.gte = getTodayDateOnly(new Date(parsed.startDate));
      }
      if (parsed.endDate) {
        whereClause.date.lte = getTodayDateOnly(new Date(parsed.endDate));
      }
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

export async function getAttendanceAnalyticsAction(filters: { startDate?: string; endDate?: string; department?: string }) {
  try {
    const { session } = await getAuthenticatedUser();

    const isStaff = session.user.role === UserRole.STAFF;
    const whereClause: any = {};

    if (isStaff) {
      whereClause.userId = session.user.id;
    }

    if (filters.department) {
      whereClause.department = filters.department;
    }

    if (filters.startDate || filters.endDate) {
      whereClause.date = {};
      if (filters.startDate) {
        whereClause.date.gte = getTodayDateOnly(new Date(filters.startDate));
      }
      if (filters.endDate) {
        whereClause.date.lte = getTodayDateOnly(new Date(filters.endDate));
      }
    }

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        breaks: true,
      },
      orderBy: { date: "asc" },
    });

    let totalDays = records.length;
    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let totalWorkMinutesSum = 0;

    const chartMap: Record<string, { date: string; present: number; late: number; hours: number }> = {};

    for (const rec of records) {
      if (rec.status === "PRESENT") presentCount++;
      if (rec.status === "LATE") lateCount++;
      if (rec.status === "HALF_DAY") halfDayCount++;

      const hours = Math.round((rec.workMinutes / 60) * 10) / 10;
      totalWorkMinutesSum += rec.workMinutes;

      const dateKey = new Date(rec.date).toISOString().split("T")[0];
      if (!chartMap[dateKey]) {
        chartMap[dateKey] = { date: dateKey, present: 0, late: 0, hours: 0 };
      }
      if (rec.status === "PRESENT") chartMap[dateKey].present += 1;
      if (rec.status === "LATE") chartMap[dateKey].late += 1;
      chartMap[dateKey].hours += hours;
    }

    const punctualityRate = totalDays > 0 ? Math.round(((presentCount + halfDayCount) / totalDays) * 100) : 100;
    const chartData = Object.values(chartMap);

    return {
      success: true,
      totalDays,
      presentCount,
      lateCount,
      halfDayCount,
      totalHours: Math.round((totalWorkMinutesSum / 60) * 10) / 10,
      punctualityRate,
      chartData,
    };
  } catch (error: any) {
    console.error("Error in getAttendanceAnalyticsAction:", error);
    return {
      success: false,
      totalDays: 0,
      presentCount: 0,
      lateCount: 0,
      halfDayCount: 0,
      totalHours: 0,
      punctualityRate: 100,
      chartData: [],
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

