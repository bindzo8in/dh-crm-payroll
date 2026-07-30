import { getAllLeaveRequestsAction, getMyLeaveRequestsAction } from "@/actions/leave";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { UserRole } from "@/app/generated/prisma/enums";
import { differenceInDays, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ManageLeaveDialog } from "./manage-leave-dialog";

export default async function LeavesPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) return null;

  const isAdmin = session.user.role === UserRole.SUPER_ADMIN || session.user.role === UserRole.ADMIN;

  let leaves: any[] = [];
  if (isAdmin) {
    const res = await getAllLeaveRequestsAction();
    console.log(res)
    if (res.success) leaves = res.leaves;
  } else {
    const res = await getMyLeaveRequestsAction();
    if (res.success) leaves = res.leaves;
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Leave Management</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "All Leave Requests" : "My Leave Requests"}</CardTitle>
          <CardDescription>
            {isAdmin ? "Manage and review employee leave requests." : "View the status of your leave requests."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaves.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">No leave requests found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>Employee</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Total Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    {isAdmin && (
                      <TableCell className="font-medium">
                        {leave.user?.name || leave.user?.email || "Unknown"}
                      </TableCell>
                    )}
                    <TableCell><Badge variant="outline">{leave.type}</Badge></TableCell>
                    <TableCell>{format(new Date(leave.startDate), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(leave.endDate), "MMM d, yyyy")}</TableCell>
                    <TableCell>
<div className="space-y-2 min-w-[180px]">
  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
    <span className="text-sm font-medium text-muted-foreground">
      Sunday
    </span>
    <span className="rounded-md bg-background px-2 py-0.5 text-sm font-semibold">
      {leave.sundayCount}
    </span>
  </div>

  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
    <span className="text-sm font-medium text-muted-foreground">
      Holiday
    </span>
    <span className="rounded-md bg-background px-2 py-0.5 text-sm font-semibold">
      {leave.holidayCount}
    </span>
  </div>

  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
    <span className="text-sm font-medium text-muted-foreground">
      Net Leave
    </span>
    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
      {leave.netLeaveDays}
    </span>
  </div>

  <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
    <span className="text-sm font-semibold">
      Total
    </span>
    <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold text-primary-foreground">
      {leave.totalDays}
    </span>
  </div>
</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{leave.reason}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          leave.status === 'APPROVED' ? 'default' :
                            leave.status === 'REJECTED' ? 'destructive' : 'secondary'
                        }
                      >
                        {leave.status}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <ManageLeaveDialog leave={leave} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
