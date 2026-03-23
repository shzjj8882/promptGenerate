import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CopyableCode } from "@/components/shared/copyable-code";

const mockCopy = vi.fn();
vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({
    copied: false,
    copy: mockCopy,
    resetCopied: vi.fn(),
  }),
}));

describe("CopyableCode", () => {
  beforeEach(() => {
    mockCopy.mockClear();
    cleanup();
  });

  it("value 为空时显示 placeholder", () => {
    render(<CopyableCode value={null} placeholder="未生成" />);
    expect(screen.getByText("未生成")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("value 有值时显示代码和复制按钮", () => {
    render(<CopyableCode value="abc12345" displayLength={8} />);
    expect(screen.getByText("abc12345")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("value 超过 displayLength 时显示截断", () => {
    render(<CopyableCode value="verylongcode123" displayLength={8} />);
    expect(screen.getByText("verylong...")).toBeInTheDocument();
  });

  it("点击复制按钮时调用 copy 并传入完整 value", () => {
    const { container } = render(<CopyableCode value="unique-copy-value" />);
    const copyBtn = container.querySelector('button[title="复制"]');
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn!);
    expect(mockCopy).toHaveBeenCalledWith("unique-copy-value");
  });
});
