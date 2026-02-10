import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (classnames merge)", () => {
  it("合并多个 class 字符串", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("过滤 falsy 值", () => {
    expect(cn("a", false, "b", null, undefined, "c")).toBe("a b c");
  });

  it("合并条件 class", () => {
    expect(cn("base", true && "active", false && "hidden")).toBe("base active");
  });

  it("tailwind 冲突时后者覆盖前者", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("无参数时返回空字符串", () => {
    expect(cn()).toBe("");
  });
});
