import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormDialog } from "@/hooks/use-form-dialog";

describe("useFormDialog", () => {
  it("初始时关闭且无编辑数据", () => {
    const { result } = renderHook(() => useFormDialog<{ id: string }>());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.editingData).toBeNull();
  });

  it("openDialog(null) 打开对话框且无编辑数据", () => {
    const { result } = renderHook(() => useFormDialog<{ id: string }>());
    act(() => {
      result.current.openDialog();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.editingData).toBeNull();
  });

  it("openDialog(data) 打开并设置编辑数据", () => {
    const { result } = renderHook(() => useFormDialog<{ id: string; name: string }>());
    const data = { id: "1", name: "test" };
    act(() => {
      result.current.openDialog(data);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.editingData).toEqual(data);
  });

  it("closeDialog 关闭并清空编辑数据", () => {
    const { result } = renderHook(() => useFormDialog<{ id: string }>());
    act(() => {
      result.current.openDialog({ id: "1" });
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      result.current.closeDialog();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.editingData).toBeNull();
  });

  it("closeDialog 调用 onClose 回调", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useFormDialog<{ id: string }>({ onClose })
    );
    act(() => {
      result.current.openDialog({ id: "1" });
    });
    act(() => {
      result.current.closeDialog();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reset 仅清空编辑数据，不改变 isOpen", () => {
    const { result } = renderHook(() => useFormDialog<{ id: string }>());
    act(() => {
      result.current.openDialog({ id: "1" });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.editingData).toBeNull();
    expect(result.current.isOpen).toBe(true);
  });
});
