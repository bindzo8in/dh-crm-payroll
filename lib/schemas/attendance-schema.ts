import { z } from "zod";
import { WorkMode, AttendanceStatus, Department } from "@/app/generated/prisma/enums";

export const clockInSchema = z.object({
  workMode: z.enum(WorkMode),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  locationName: z.string().nullable().optional(),
  selfieUrl: z.string().nullable().optional(),
  selfiePublicId: z.string().nullable().optional(),
  notes: z.string().max(500, "Notes must be under 500 characters").nullable().optional(),
});

export type ClockInInput = z.infer<typeof clockInSchema>;

export const clockOutSchema = z.object({
  notes: z.string().max(500, "Notes must be under 500 characters").nullable().optional(),
});

export type ClockOutInput = z.infer<typeof clockOutSchema>;

export const startBreakSchema = z.object({
  type: z.string().default("LUNCH"),
});

export type StartBreakInput = z.infer<typeof startBreakSchema>;

export const endBreakSchema = z.object({
  breakId: z.string().optional(),
});

export type EndBreakInput = z.infer<typeof endBreakSchema>;

export const attendanceFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(AttendanceStatus).optional(),
  department: z.enum(Department).optional(),
  userId: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(20),
});

export type AttendanceFilterInput = z.infer<typeof attendanceFilterSchema>;

export const regularizeAttendanceSchema = z.object({
  attendanceRecordId: z.string().min(1, "Record ID is required"),
  clockIn: z.string().min(1, "Clock In time is required"),
  clockOut: z.string().optional(),
  reason: z.string().min(5, "Please provide a valid reason (min 5 chars)"),
});

export type RegularizeAttendanceInput = z.infer<typeof regularizeAttendanceSchema>;

export const updateAttendanceSettingsSchema = z.object({
  expectedClockIn: z.string().regex(/^\d{2}:\d{2}$/, "Format must be HH:mm"),
  expectedClockOut: z.string().regex(/^\d{2}:\d{2}$/, "Format must be HH:mm"),
  gracePeriodMinutes: z.number().int().min(0).max(120),
  halfDayThresholdMinutes: z.number().int().min(30).max(720),
  maxShiftHoursCap: z.number().int().min(4).max(24),
  allowOvernightShift: z.boolean().default(true),
  officeLatitude: z.number().nullable().optional(),
  officeLongitude: z.number().nullable().optional(),
  officeRadiusMeters: z.number().int().min(10).max(100000).default(500),
  enforceOfficeGeofence: z.boolean().default(true),
});

export type UpdateAttendanceSettingsInput = z.infer<typeof updateAttendanceSettingsSchema>;

export const editAttendanceSchema = z.object({
  attendanceRecordId: z.string().min(1, "Record ID is required"),
  clockIn: z.string().min(1, "Clock In time is required"),
  clockOut: z.string().optional().nullable(),
  status: z.enum(AttendanceStatus).optional(),
  reason: z.string().min(5, "Please provide a valid reason (min 5 chars)"),
});

export type EditAttendanceInput = z.infer<typeof editAttendanceSchema>;

export const advancedAttendanceReportSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  department: z.enum(Department).optional(),
  userId: z.string().optional(),
  status: z.enum(AttendanceStatus).optional(),
  workMode: z.enum(WorkMode).optional(),
  onlyLate: z.boolean().optional(),
  minLateMinutes: z.number().int().min(0).optional(),
  onlyEarlyLeave: z.boolean().optional(),
  onlyOvertime: z.boolean().optional(),
  minWorkMinutes: z.number().int().min(0).optional(),
  maxWorkMinutes: z.number().int().min(0).optional(),
  onlyExcessiveBreaks: z.boolean().optional(),
  minBreakMinutes: z.number().int().min(0).optional(),
  onlyAutoCheckedOut: z.boolean().optional(),
  onlyRegularized: z.boolean().optional(),
  onlyManuallyEdited: z.boolean().optional(),
  geofenceFilter: z.enum(["ALL", "IN_OFFICE", "OUTSIDE_OR_REMOTE"]).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(25),
});

export type AdvancedAttendanceReportInput = z.infer<typeof advancedAttendanceReportSchema>;

