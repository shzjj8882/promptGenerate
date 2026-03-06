"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "@/components/icons";
import { useTheme } from "@/components/shared/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <span className="inline-flex h-[1.2rem] w-[1.2rem] shrink-0 items-center justify-center">
            <Sun className="h-[1.2rem] w-[1.2rem] shrink-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 inline-flex! items-center justify-center" />
          </span>
          <span className="absolute inset-0 inline-flex items-center justify-center">
            <Moon className="h-[1.2rem] w-[1.2rem] shrink-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 inline-flex! items-center justify-center" />
          </span>
          <span className="sr-only">切换主题</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          <span>浅色</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          <span>深色</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>跟随系统</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
