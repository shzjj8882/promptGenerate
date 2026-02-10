import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionButtons } from "@/components/shared/action-buttons";

describe("ActionButtons", () => {
  it("无 onEdit/onDelete 且无 additionalActions 时渲染 null", () => {
    const { container } = render(<ActionButtons />);
    expect(container.firstChild).toBeNull();
  });

  it("variant inline 时渲染编辑、删除按钮", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ActionButtons
        variant="inline"
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
    expect(screen.getByRole("button", { name: /编辑/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删除/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /删除/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("仅有 onDelete 时只显示删除按钮", () => {
    const { container } = render(
      <ActionButtons
        variant="inline"
        onDelete={() => {}}
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.querySelector('[data-slot="button"]')).toBeTruthy();
    expect(wrapper.textContent).toMatch(/删除/);
    expect(wrapper.textContent).not.toMatch(/编辑/);
  });

  it("variant dropdown 时渲染下拉触发按钮", () => {
    render(
      <ActionButtons
        onEdit={() => {}}
        onDelete={() => {}}
        variant="dropdown"
      />
    );
    expect(screen.getByRole("button", { name: /打开菜单/ })).toBeInTheDocument();
  });

  it("additionalActions 渲染并可点击", () => {
    const onCustom = vi.fn();
    render(
      <ActionButtons
        variant="inline"
        additionalActions={[{ label: "自定义", onClick: onCustom }]}
      />
    );
    const btn = screen.getByRole("button", { name: "自定义" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onCustom).toHaveBeenCalledTimes(1);
  });
});
