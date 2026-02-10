import { describe, it, expect } from "vitest";
import { getDisplayMessage } from "@/lib/utils/error";
import { ApiError } from "@/lib/api/config";

describe("getDisplayMessage", () => {
  it("ApiError 时返回其 message", () => {
    const err = new ApiError("自定义错误信息", 400);
    expect(getDisplayMessage(err, "默认")).toBe("自定义错误信息");
  });

  it("非 ApiError 时返回 fallback", () => {
    expect(getDisplayMessage(new Error("other"), "默认")).toBe("默认");
    expect(getDisplayMessage("string", "默认")).toBe("默认");
    expect(getDisplayMessage(null, "默认")).toBe("默认");
  });
});
