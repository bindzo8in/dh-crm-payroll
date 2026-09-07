import "dotenv/config";
import prisma from "@/lib/prisma";

async function seedAttendance() {
  console.log("🌱 Starting attendance test records seed...");

  const users = await prisma.user.findMany({ take: 5 });

  if (users.length === 0) {
    console.error("❌ No users found in database! Please create a user first.");
    return;
  }

  console.log(`Found ${users.length} users: ${users.map((u) => u.name || u.email).join(", ")}`);

  // Ensure default AttendanceSettings exist
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
        officeLatitude: 28.6139,
        officeLongitude: 77.209,
        officeRadiusMeters: 500,
        enforceOfficeGeofence: true,
      },
    });
    console.log("✅ Default AttendanceSettings created.");
  } else {
    // Ensure office lat/lng are set if null
    if (!settings.officeLatitude || !settings.officeLongitude) {
      await prisma.attendanceSettings.update({
        where: { id: settings.id },
        data: {
          officeLatitude: 28.6139,
          officeLongitude: 77.209,
          officeRadiusMeters: 500,
          enforceOfficeGeofence: true,
        },
      });
      console.log("✅ Updated AttendanceSettings with sample office coordinates.");
    }
  }

  const sampleMockData = [
    {
      daysAgo: 1,
      clockInHour: 9,
      clockInMin: 2,
      clockOutHour: 18,
      clockOutMin: 5,
      status: "PRESENT",
      workMode: "OFFICE",
      distanceFromOffice: 42,
      notes: "On-time arrival at main office HQ.",
      lateMinutes: 0,
      workMinutes: 543,
      breakMinutes: 45,
    },
    {
      daysAgo: 2,
      clockInHour: 9,
      clockInMin: 35,
      clockOutHour: 18,
      clockOutMin: 10,
      status: "LATE",
      workMode: "OFFICE",
      distanceFromOffice: 78,
      notes: "Heavy traffic on highway.",
      lateMinutes: 35,
      workMinutes: 515,
      breakMinutes: 45,
    },
    {
      daysAgo: 3,
      clockInHour: 9,
      clockInMin: 0,
      clockOutHour: 12,
      clockOutMin: 30,
      status: "HALF_DAY",
      workMode: "REMOTE",
      distanceFromOffice: null,
      notes: "Half day leave - doctor appointment in afternoon. | Shift duration under 4 hours (3h 30m logged). Marked as Half Day.",
      lateMinutes: 0,
      workMinutes: 210,
      breakMinutes: 0,
    },
    {
      daysAgo: 4,
      clockInHour: 8,
      clockInMin: 50,
      clockOutHour: 18,
      clockOutMin: 0,
      status: "PRESENT",
      workMode: "HYBRID",
      distanceFromOffice: 120,
      notes: "Client site visits in afternoon.",
      lateMinutes: 0,
      workMinutes: 550,
      breakMinutes: 60,
    },
    {
      daysAgo: 5,
      clockInHour: 9,
      clockInMin: 12,
      clockOutHour: 18,
      clockOutMin: 15,
      status: "PRESENT",
      workMode: "OFFICE",
      distanceFromOffice: 15,
      notes: "Arrived within grace period.",
      lateMinutes: 0,
      workMinutes: 543,
      breakMinutes: 45,
    },
    {
      daysAgo: 6,
      clockInHour: 9,
      clockInMin: 45,
      clockOutHour: 17,
      clockOutMin: 30,
      status: "LATE",
      workMode: "OFFICE",
      distanceFromOffice: 95,
      notes: "Metro train delay.",
      lateMinutes: 45,
      workMinutes: 465,
      breakMinutes: 45,
    },
    {
      daysAgo: 7,
      clockInHour: 10,
      clockInMin: 0,
      clockOutHour: 13,
      clockOutMin: 15,
      status: "HALF_DAY",
      workMode: "OFFICE",
      distanceFromOffice: 65,
      notes: "Short morning shift. | Shift duration under 4 hours (3h 15m logged). Marked as Half Day.",
      lateMinutes: 60,
      workMinutes: 195,
      breakMinutes: 0,
    },
  ] as const;

  let createdCount = 0;

  for (const user of users) {
    for (const item of sampleMockData) {
      const d = new Date();
      d.setDate(d.getDate() - item.daysAgo);
      d.setUTCHours(0, 0, 0, 0);

      const clockIn = new Date(d);
      clockIn.setHours(item.clockInHour, item.clockInMin, 0, 0);

      const clockOut = new Date(d);
      clockOut.setHours(item.clockOutHour, item.clockOutMin, 0, 0);

      // Check if record exists
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          userId: user.id,
          date: d,
        },
      });

      if (existing) {
        continue;
      }

      const rec = await prisma.attendanceRecord.create({
        data: {
          userId: user.id,
          date: d,
          clockIn,
          clockOut,
          status: item.status as any,
          workMode: item.workMode as any,
          department: user.department || "DEVELOPMENT",
          latitude: 28.6139 + (Math.random() - 0.5) * 0.002,
          longitude: 77.209 + (Math.random() - 0.5) * 0.002,
          distanceFromOffice: item.distanceFromOffice,
          locationName: item.workMode === "OFFICE" ? "Headquarters Office" : "Remote / Home",
          notes: item.notes,
          lateMinutes: item.lateMinutes,
          workMinutes: item.workMinutes,
          breakMinutes: item.breakMinutes,
        },
      });

      // Audit Log for Create
      await prisma.attendanceAuditLog.create({
        data: {
          attendanceRecordId: rec.id,
          userId: user.id,
          action: "CREATE",
          newValues: JSON.stringify({ clockIn, status: item.status, workMode: item.workMode }),
          reason: "Clock-in recorded via kiosk.",
        },
      });

      // Audit Log for Clock-Out / System
      await prisma.attendanceAuditLog.create({
        data: {
          attendanceRecordId: rec.id,
          userId: user.id,
          action: "UPDATE",
          oldValues: JSON.stringify({ clockOut: null }),
          newValues: JSON.stringify({ clockOut, workMinutes: item.workMinutes, status: item.status }),
          reason: item.status === "HALF_DAY" ? "System updated status to HALF_DAY (< 4 hrs)." : "Clocked out shift.",
        },
      });

      createdCount++;
    }
  }

  console.log(`🎉 Successfully seeded ${createdCount} attendance records!`);
}

seedAttendance()
  .catch((e) => {
    console.error("Error seeding attendance records:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
