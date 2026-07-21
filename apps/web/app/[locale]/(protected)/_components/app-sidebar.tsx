"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import type { User } from "schemas";
import { useLogout } from "@/features/auth/hooks";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/shared/components/ui/sidebar";

function initials(user: User) {
  return `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
}

export function AppSidebar({ user }: { user: User }) {
  const logout = useLogout();
  const t = useTranslations("Sidebar");

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <Image
            src="/images/brand-logo.png"
            alt=""
            width={20}
            height={20}
            className="size-5 invert"
          />
          <span className="text-sm font-semibold">b-mate</span>
        </div>
      </SidebarHeader>
      <SidebarContent />
      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger className="hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-md p-2 text-left">
            <Avatar className="size-8">
              <AvatarFallback>{initials(user)}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">
              {user.firstName} {user.lastName}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/profile">{t("profile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => logout.mutate()}>{t("logout")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
