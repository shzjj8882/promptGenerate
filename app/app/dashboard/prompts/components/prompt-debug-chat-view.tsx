"use client";

import { Bot } from "@/components/icons";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PromptDebugChatViewProps {
  messages: ChatMessage[];
  streaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 提示词调试 - 聊天模式消息展示区域
 */
export function PromptDebugChatView({
  messages,
  streaming,
  messagesEndRef,
}: PromptDebugChatViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">聊天预览</h3>
        </div>
      ) : (
        <>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`flex flex-col gap-1 ${
                  msg.role === "user" ? "max-w-[75%] items-end" : "max-w-[85%] items-start"
                }`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-background border rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {streaming && (
            <div className="flex items-start">
              <div className="flex flex-col gap-1 max-w-[85%] items-start">
                <div className="bg-background border rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div
                        className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground ml-1">
                      AI 正在思考...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
