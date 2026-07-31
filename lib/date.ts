// lib/date.ts

import { formatInTimeZone } from "date-fns-tz";

const COMPANY_TIMEZONE = "Asia/Kolkata";

export function getAttendanceDate(date = new Date()) {
    return formatInTimeZone(
        date,
        COMPANY_TIMEZONE,
        "yyyy-MM-dd"
    );
}