"use client";

import { useState, useCallback, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Copy, Check, Key, RotateCcw, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resetMyTeamAuthcode } from "@/lib/api/teams";
import { userStore } from "@/store/user-store";
import { MENU_BUTTON_PERMISSIONS, useHasMenuButtonPermission } from "@/lib/permissions";
import { logger } from "@/lib/utils/logger";
import { getCurrentUser } from "@/lib/api/auth";
import type { WidgetSize } from "./types";

interface WidgetTeamCodeProps {
  size: WidgetSize;
  widgetId: string;
  onRemove?: (id: string) => void;
}

function WidgetTeamCodeImpl({ size, widgetId, onRemove }: WidgetTeamCodeProps) {
  const [copied, setCopied] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const teamAuthcode = userStore.user?.team_authcode;
  const teamCode = userStore.user?.team_code;

  const handleCopyAuthcode = useCallback(async () => {
    if (!teamAuthcode) return;
    try {
      await navigator.clipboard.writeText(teamAuthcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("复制失败", err);
    }
  }, [teamAuthcode]);

  const handleResetAuthcode = useCallback(async () => {
    setResetting(true);
    try {
      await resetMyTeamAuthcode();
      const userInfo = await getCurrentUser();
      userStore.setUser(userInfo);
      setResetDialogOpen(false);
      logger.info("认证码重置成功");
    } catch (err) {
      logger.error("重置认证码失败", err);
    } finally {
      setResetting(false);
    }
  }, []);

  const authcode = mounted ? teamAuthcode : null;
  const teamName = mounted && teamCode ? `团队: ${teamCode}` : "";
  const canResetAuthcode = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.team?.resetAuthcode);

  const showCompact = size === "small";

  return (
    <>
      <Card className="h-full flex flex-col py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">API 认证码</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {teamName && (
              <Badge variant="outline" className="font-mono text-xs">
                {teamName}
              </Badge>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => onRemove(widgetId)}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 px-4 pb-4 pt-0">
          {authcode ? (
            <div className="space-y-2">
              {!showCompact && (
                <CardDescription className="mt-0 text-xs">
                  用于调用 /api 接口，请求头添加 X-Team-AuthCode
                </CardDescription>
              )}
              <div className="flex items-center gap-2">
                <code className="block flex-1 min-w-0 text-xs font-mono bg-muted px-2 py-1.5 rounded border break-all truncate">
                  {authcode}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopyAuthcode}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                {teamCode && canResetAuthcode && !showCompact && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResetDialogOpen(true)}
                    className="shrink-0"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    重置
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              未找到团队认证码，请联系管理员
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置认证码</AlertDialogTitle>
            <AlertDialogDescription>
              确定要重置团队认证码吗？重置后旧认证码将立即失效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAuthcode}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? "重置中..." : "确认重置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const WidgetTeamCode = observer(WidgetTeamCodeImpl);

export { WidgetTeamCode };
