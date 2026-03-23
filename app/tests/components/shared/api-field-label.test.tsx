import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ApiFieldLabel } from "@/components/shared/api-field-label";

describe("ApiFieldLabel", () => {
  beforeEach(() => cleanup());

  it("渲染 keyName", () => {
    render(<ApiFieldLabel keyName="user_message" />);
    expect(screen.getByText("user_message")).toBeInTheDocument();
  });

  it("required 为 true 时显示红色星号", () => {
    render(<ApiFieldLabel keyName="model_id" required />);
    expect(screen.getByText(/\*/)).toBeInTheDocument();
  });

  it("optional 为 true 时显示「可选」", () => {
    render(<ApiFieldLabel keyName="tenantCode" optional />);
    expect(screen.getByText("可选")).toBeInTheDocument();
  });

  it("typeBadge 为 string 时显示 Badge", () => {
    render(<ApiFieldLabel keyName="field" typeBadge="string" />);
    expect(screen.getByText("string")).toBeInTheDocument();
  });

  it("htmlFor 绑定到 Label", () => {
    render(<ApiFieldLabel keyName="html_for_field" htmlFor="input-id" />);
    const label = screen.getByText("html_for_field").closest("label");
    expect(label).toHaveAttribute("for", "input-id");
  });
});
