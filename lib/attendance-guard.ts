import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
// import prisma from "@/lib/prisma";
import { UserRole, Department } from "@/app/generated/prisma/enums";
type Session = typeof auth.$Infer.Session
export interface AttendanceUserPermissions {
  session: Session;
  user: Session["user"];
  isAuthorized: boolean;
  hasDepartment: boolean;
}

/**
 * Ensures user is authenticated and has permission to access the Attendance Portal:
 * Must have a staff/admin role and belong to an assigned department.
 */
export async function requireAttendanceAccess(): Promise<AttendanceUserPermissions> {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (!session || !session.user) {
    redirect("/signin");
  }


//   const user = await prisma.user.findUnique({
//     where: { id: session.user.id },
//     select: {
//       id: true,
//       name: true,
//       email: true,
//       image: true,
//       role: true,
//       department: true,
//       createdAt: true,
//       workMode: true,
//     },
//   });
//   if (!user) {
//     redirect("/signin");
//   }

  const isAdminOrSuperAdmin = session.user.role === UserRole.SUPER_ADMIN || session.user.role === UserRole.ADMIN;
  const isAuthorized = isAdminOrSuperAdmin || !!(session.user.role && session.user.department);

  return {
    session,
    user: session.user,
    isAuthorized,
    hasDepartment: !!session.user.department,
  };
}

export function isAttendanceManager(user: { role?: UserRole | string | null; department?: Department | string | null }): boolean {
  if (!user) return false;
  const role = user.role ? String(user.role).toUpperCase() : "";
  const dept = user.department ? String(user.department).toUpperCase() : "";
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (role === "STAFF" && dept === "HR") return true;
  return false;
}

