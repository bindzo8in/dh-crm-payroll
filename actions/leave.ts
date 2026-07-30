"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import { UserRole, LeaveType, LeaveStatus } from "@/app/generated/prisma/enums";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eachDayOfInterval, format, isSunday } from "date-fns";

const leaveRequestSchema = z.object({
  type: z.enum(LeaveType),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().min(1, "Reason is required").max(500),
});

export async function submitLeaveRequestAction(input: any) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const parsed = leaveRequestSchema.parse(input);


  if (parsed.endDate < parsed.startDate) {
    throw new Error("End date cannot be before start date");
  }
  const start = parsed.startDate;
  const end = parsed.endDate;

  // 1. Generate every calendar day in the interval
  const allDays = eachDayOfInterval({ start: parsed.startDate, end: parsed.endDate });

  // 2. Fetch all database holidays that fall within this leave range
  const databaseHolidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      }
    },
    select: { date: true }
  })

  // Convert DB date intervals into standard comparable format strings
  const holidayStrings = new Set(
    databaseHolidays.map((h) => format(h.date, 'yyyy-MM-dd'))
  );

  // 3. Initialize metrics counters
  let totalSundays = 0;
  let totalHolidays = 0;
  let totalNormalLeaveDays = 0; // Net payable leave days

  // 4. Categorize each day in a single loop execution
  allDays.forEach((day) => {
    const formattedStr = format(day, 'yyyy-MM-dd');
    const isDaySunday = isSunday(day);
    const isDayHoliday = holidayStrings.has(formattedStr);

    if (isDaySunday) {
      totalSundays++;
    } else if (isDayHoliday) {
      // Note: If a public holiday falls on a Sunday, it is counted as a Sunday above.
      totalHolidays++;
    } else {
      totalNormalLeaveDays++;
    }
  });

  const leave = await prisma.leaveRequest.create({
    data: {
      userId: session.user.id,
      type: parsed.type,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      reason: parsed.reason,
      status: LeaveStatus.PENDING,

      // Map your loop metrics here:
      totalDays: allDays.length,
      netLeaveDays: totalNormalLeaveDays,
      sundayCount: totalSundays,
      holidayCount: totalHolidays,
    },
  });


  revalidatePath("/dashboard/leaves");
  return {
    success: true, leave
  };
}

export async function getMyLeaveRequestsAction() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const leaves = await prisma.leaveRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return { success: true, leaves };
}

export async function getAllLeaveRequestsAction(page: number = 0, limit: number = 20) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
    throw new Error("Unauthorized");
  }

  const leaves = await prisma.leaveRequest.findMany({
    include: {
      user: {
        select: { id: true, name: true, email: true, department: true, role: true }
      }
    },
    orderBy: { createdAt: "desc" },
    skip: page * limit,
    take: limit,
  });

  const totalCount = await prisma.leaveRequest.count();

  return { success: true, leaves, totalCount };
}

export async function updateLeaveStatusAction(id: string, status: LeaveStatus, managerComment?: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
    throw new Error("Unauthorized");
  }

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      managerComment: managerComment || null
    },
    include: { user: true }
  });

  revalidatePath("/dashboard/leaves");
  return { success: true, leave };
}
