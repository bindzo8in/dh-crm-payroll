// lib/date.ts

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { format, parse } from "date-fns";

const COMPANY_TIMEZONE = "Asia/Kolkata";

export function getAttendanceDate(date = new Date()) {
    return formatInTimeZone(
        date,
        COMPANY_TIMEZONE,
        "yyyy-MM-dd"
    );
}

/**
 * Convert a Date (UTC) to IST time
 */
export function convertToIST(date: Date): Date {
    return toZonedTime(date, COMPANY_TIMEZONE);
}

/**
 * Convert a Date (IST) to UTC for storage
 */
export function convertToUTC(date: Date): Date {
    return fromZonedTime(date, COMPANY_TIMEZONE);
}

/**
 * Format a Date in IST timezone
 * @param date - The date to format (can be UTC or any timezone)
 * @param formatStr - Format string (default: "HH:mm")
 */
export function formatInIST(date: Date, formatStr: string = "HH:mm"): string {
    return formatInTimeZone(date, COMPANY_TIMEZONE, formatStr);
}

/**
 * Get current time in IST
 */
export function getNowInIST(): Date {
    return toZonedTime(new Date(), COMPANY_TIMEZONE);
}

/**
 * Convert datetime-local input value to UTC Date
 * @param dateTimeLocalValue - Value from datetime-local input (e.g., "2024-01-15T14:30")
 */
export function dateTimeLocalToUTC(dateTimeLocalValue: string): Date {
    if (!dateTimeLocalValue) return new Date();
    // Parse the datetime-local value as if it's in IST
    const istDate = parse(dateTimeLocalValue, "yyyy-MM-dd'T'HH:mm", new Date());
    // Convert IST to UTC for storage
    return fromZonedTime(istDate, COMPANY_TIMEZONE);
}

/**
 * Convert UTC Date to datetime-local input value
 * @param utcDate - UTC date from database
 */
export function utcToDateTimeLocal(utcDate: Date): string {
    const istDate = toZonedTime(utcDate, COMPANY_TIMEZONE);
    return format(istDate, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Format Date as time display in IST (HH:mm format)
 */
export function formatTimeInIST(utcDate: Date): string {
    return formatInTimeZone(utcDate, COMPANY_TIMEZONE, "HH:mm");
}

/**
 * Format Date as full datetime in IST
 */
export function formatDateTimeInIST(utcDate: Date): string {
    return formatInTimeZone(utcDate, COMPANY_TIMEZONE, "MMM dd, yyyy HH:mm");
}