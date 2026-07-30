"use client"

import * as React from "react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LayoutDashboardIcon, ChartBarIcon, FolderIcon, UsersIcon, CameraIcon, FileTextIcon, Settings2Icon, CircleHelpIcon, SearchIcon, DatabaseIcon, FileChartColumnIcon, FileIcon, CommandIcon, BookUser, BoxIcon, HandshakeIcon, ScrollText, TableIcon, ReceiptText, ClockIcon, CalendarHeart, CalendarOff, WalletIcon } from "lucide-react"
import { env } from "@/lib/env"

const data = {
  user: {
    name: "admin",
    email: "admin@designhubone.com",
    avatar: "/logo.png",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: (
        <LayoutDashboardIcon
        />
      ),
    },
    {
      title: "Attendance",
      url: "/attendance",
      icon: (
        <ClockIcon />
      ),
    },
    {
      title: "Leaves",
      url: "/dashboard/leaves",
      icon: (
        <CalendarOff />
      ),
    },
    {
      title: "Holidays",
      url: "/dashboard/holidays",
      icon: (
        <CalendarHeart />
      ),
    },
    {
      title: "Users",
      url: "/dashboard/users",
      icon: (
        <UsersIcon
        />
      ),
    },
    {
      title: "Customers",
      url: "/dashboard/customers",
      icon: (
        <BookUser />
      )
    },
    {
      title: "Services",
      url: "/dashboard/services",
      icon: (
        <FileTextIcon />
      )
    },
    {
      title: "Packages",
      url: "/dashboard/services/packages",
      icon: (
        <BoxIcon
        />
      ),
    },
    {
      title: "Tariffs",
      url: "/dashboard/tariffs",
      icon: (
        <TableIcon
        />
      ),
    },
    {
      title: "Terms",
      url: "/dashboard/terms",
      icon: (
        <HandshakeIcon
        />
      ),
    },
    {
      title: "Proposals",
      url: "/dashboard/proposals",
      icon: (
        <ScrollText
        />
      ),
    },
    {
      title: "Analytics",
      url: "#",
      icon: (
        <ChartBarIcon
        />
      ),
    },
    {
      title: "Salary",
      url: "/dashboard/salary",
      icon: (
        <WalletIcon />
      )
    },
    {
      title: "Invoice",
      url: "/dashboard/invoices",
      icon: (
        <ReceiptText />
      )
    }
  ],
  navSecondary: [
    {
      title: "Company Profile",
      url: "/dashboard/settings/business/company",
      icon: (
        <Settings2Icon
        />
      ),
    },
    {
      title: "Bank Accounts",
      url: "/dashboard/settings/business/banks",
      icon: (
        <BoxIcon
        />
      ),
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#">
                <CommandIcon className="size-5!" />
                <span className="text-base font-semibold">{env.NEXT_PUBLIC_APP_NAME}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {/* <NavDocuments items={data.documents} /> */}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
