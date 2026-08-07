"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import type { User } from "schemas";
import { useLogout } from "@/features/auth/hooks";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

function initials(user: User) {
  return `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
}

export function TopNav({ user }: { user: User }) {
  const logout = useLogout();
  const t = useTranslations("TopNav");

  return (
    <header className="flex h-14 items-center justify-between px-4 sm:px-6">
      <Link href="/home" className="flex items-center gap-2">
        <Image src="/images/logo-square.png" alt="" width={332} height={332} className="size-6" />
        <span className="text-sm font-semibold text-primary">Diaphane</span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-accent flex items-center gap-2 rounded-md p-1.5">
          <Avatar className="size-8">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback>{initials(user)}</AvatarFallback>
          </Avatar>
          <span className="hidden truncate text-sm sm:inline">
            {user.firstName} {user.lastName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/profile">{t("profile")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => logout.mutate()}>{t("logout")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
