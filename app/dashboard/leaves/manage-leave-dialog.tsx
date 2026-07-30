"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LeaveStatus } from "@/app/generated/prisma/enums";
import { updateLeaveStatusAction } from "@/actions/leave";
import { useMutation } from "@tanstack/react-query";

export function ManageLeaveDialog({ leave }: { leave: any }) {
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeaveStatus }) =>
      updateLeaveStatusAction(id, status),
    onSuccess: () => {
      setOpen(false);
    },
  });

  const handleStatusUpdate = (status: LeaveStatus) => {
    mutation.mutate({ id: leave.id, status });
  };
  console.log(leave)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Manage</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Leave Request</DialogTitle>
          <DialogDescription>
            Review and update the status of this leave request.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          <p><strong>Employee:</strong> {leave.user?.name || leave.user?.email}</p>
          <p><strong>Type:</strong> {leave.type}</p>
          <p><strong>Role:</strong> {leave.user?.role}</p>
          <p><strong>Department:</strong> {leave.user?.department ?? 'Unknown'}</p>
          <p><strong>Reason:</strong> {leave.reason}</p>
        </div>

        <DialogFooter className="flex space-x-2">
          <Button
            variant="destructive"
            onClick={() => handleStatusUpdate(LeaveStatus.REJECTED)}
            disabled={mutation.isPending || leave.status === LeaveStatus.REJECTED}
          >
            Reject
          </Button>
          <Button
            variant="default"
            onClick={() => handleStatusUpdate(LeaveStatus.APPROVED)}
            disabled={mutation.isPending || leave.status === LeaveStatus.APPROVED}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
