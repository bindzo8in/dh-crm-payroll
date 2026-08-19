"use client";

import React from "react";
import { ClockIcon, HistoryIcon, BarChart3Icon, UserIcon, FileSpreadsheetIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type AttendanceTab = "kiosk" | "history" | "analytics" | "reports";

interface MobileAttendanceNavProps {
  activeTab: AttendanceTab;
  onSelectTab: (tab: AttendanceTab) => void;
  isManager?: boolean;
}

export function MobileAttendanceNav({ activeTab, onSelectTab, isManager }: MobileAttendanceNavProps) {
  const tabs = [
    { id: "kiosk" as AttendanceTab, label: "Punch Clock", icon: ClockIcon },
    { id: "history" as AttendanceTab, label: "History", icon: HistoryIcon },
    { id: "analytics" as AttendanceTab, label: "Analytics", icon: BarChart3Icon },
    ...(isManager
      ? [{ id: "reports" as AttendanceTab, label: "Reports", icon: FileSpreadsheetIcon }]
      : []),
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/80 px-4 py-2 flex items-center justify-around shadow-2xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              "flex flex-col items-center justify-center w-full py-1 text-xs font-semibold transition-all duration-200",
              isActive
                ? "text-primary scale-105"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-full mb-1 transition-all",
              isActive ? "bg-primary/15" : "bg-transparent"
            )}>
              <Icon className="w-5 h-5" />
            </div>
            <span>{tab.label}</span>
          </button>
        );
      })}

      {/* Direct link to Attendance Profile for mobile */}
      <Link
        href="/attendance/profile"
        className="flex flex-col items-center justify-center w-full py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all duration-200"
      >
        <div className="p-1.5 rounded-full mb-1 transition-all bg-transparent">
          <UserIcon className="w-5 h-5" />
        </div>
        <span>Profile</span>
      </Link>
    </div>
  );
}
