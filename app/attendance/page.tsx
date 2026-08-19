import { requireAttendanceAccess } from "@/lib/attendance-guard";
import { getTodayAttendanceAction } from "@/actions/attendance";
import { AttendanceClientHub } from "@/components/attendance/attendance-client-hub";
import { Metadata } from "next";
import Link from "next/link";
import { CommandIcon, LayoutDashboardIcon, UserIcon, AlertCircleIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { UserRole, WorkMode } from "@/app/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Attendance Kiosk & Portal | CRM",
  description: "Dedicated mobile kiosk attendance portal, selfie verification, and analytics.",
};

export default async function AttendancePage() {
  const { user, isAuthorized, hasDepartment } = await requireAttendanceAccess();
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-card border border-border rounded-3xl p-8 shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <ShieldAlertIcon className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight">Access Restricted</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {!hasDepartment ? (
                <>
                  You are not currently assigned to any <strong>Department</strong>. Access to the Attendance Portal is only permitted for staff members belonging to an active department.
                </>
              ) : (
                <>
                  Your user role does not have permission to access the Attendance Portal.
                </>
              )}
            </p>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 p-4 rounded-2xl text-xs text-left flex items-start gap-3">
            <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Need Access?</p>
              <p>Please contact an Administrator or HR manager to assign your account to a department (Sales, Development, Design, SEO, Marketing, HR, or Operations).</p>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <Button asChild className="w-full rounded-2xl font-semibold shadow-md">
              <Link href="/dashboard">
                <LayoutDashboardIcon className="w-4 h-4 mr-2" /> Return to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  let record = null;
  let settings = null;
  let userRole = user.role || "STAFF";

  try {
    const res = await getTodayAttendanceAction();
    record = res.record;
    settings = res.settings;
    userRole = res.userRole as UserRole;
  } catch (error) {
    console.error("Failed to load today's attendance record:", error);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Standalone Top Bar */}
      <header className="w-full border-b border-border/60 bg-card/80 backdrop-blur px-4 md:px-8 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
            <CommandIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight">{env.NEXT_PUBLIC_APP_NAME}</span>
            <span className="text-xs text-muted-foreground block font-medium">Attendance Portal</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-2xl text-xs font-semibold shadow-sm">
            <Link href="/attendance/profile">
              <UserIcon className="w-4 h-4 mr-1.5 text-primary" /> Profile
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="rounded-2xl text-xs font-semibold shadow-sm">
            <Link href="/dashboard">
              <LayoutDashboardIcon className="w-4 h-4 mr-1.5 text-primary" /> Dashboard
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Dedicated Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
        <AttendanceClientHub
          initialRecord={record}
          settings={settings}
          userRole={userRole}
          userDepartment={user.department || ""}
          workMode={user.workMode as WorkMode || WorkMode.OFFICE}
        />
      </main>
    </div>
  );
}

