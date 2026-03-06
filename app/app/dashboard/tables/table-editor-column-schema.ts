import { z } from "zod";

const optionItemSchema = z.object({
  key: z.string(),
  value: z.string(),
});

/** 添加列表单校验（key、label、类型、选项、默认值） */
export const addColumnFormSchema = z
  .object({
    columnKey: z.string().min(1, "请填写列 key"),
    label: z.string().min(1, "请填写列名称"),
    type: z.enum(["text", "number", "date", "single_select", "multi_select"]),
    options: z.array(optionItemSchema),
    dateFormat: z.string(),
    defaultValue: z.string(),
  })
  .refine(
    (data) => {
      if (data.type !== "single_select" && data.type !== "multi_select") return true;
      const valid = data.options.filter((o) => o.value.trim());
      return valid.length >= 1;
    },
    { message: "单选/多选类型需要至少一个选项", path: ["options"] }
  )
  .refine(
    (data) => {
      if (data.type !== "single_select" && data.type !== "multi_select") return true;
      const values = data.options.map((o) => o.value.trim()).filter(Boolean);
      return values.length === new Set(values).size;
    },
    { message: "选项值不能重复", path: ["options"] }
  )
  .refine(
    (data) => {
      if (data.type !== "single_select" || !data.defaultValue.trim()) return true;
      const values = data.options.map((o) => o.value.trim()).filter(Boolean);
      return values.includes(data.defaultValue.trim());
    },
    { message: "默认值必须在选项列表中", path: ["defaultValue"] }
  )
  .refine(
    (data) => {
      if (data.type !== "multi_select" || !data.defaultValue.trim()) return true;
      const values = data.options.map((o) => o.value.trim()).filter(Boolean);
      const defaults = data.defaultValue.split(",").map((v) => v.trim()).filter(Boolean);
      return defaults.every((v) => values.includes(v));
    },
    { message: "默认值中的某些值不在选项中", path: ["defaultValue"] }
  );

/** 编辑列表单校验（无 columnKey，其余同添加列） */
export const editColumnFormSchema = z
  .object({
    label: z.string().min(1, "请填写列名称"),
    type: z.enum(["text", "number", "date", "single_select", "multi_select"]),
    options: z.array(optionItemSchema),
    dateFormat: z.string(),
    defaultValue: z.string(),
  })
  .refine(
    (data) => {
      if (data.type !== "single_select" && data.type !== "multi_select") return true;
      const valid = data.options.filter((o) => o.value.trim());
      return valid.length >= 1;
    },
    { message: "单选/多选类型需要至少一个选项", path: ["options"] }
  )
  .refine(
    (data) => {
      if (data.type !== "single_select" && data.type !== "multi_select") return true;
      const values = data.options.map((o) => o.value.trim()).filter(Boolean);
      return values.length === new Set(values).size;
    },
    { message: "选项值不能重复", path: ["options"] }
  )
  .refine(
    (data) => {
      if (data.type !== "single_select" || !data.defaultValue.trim()) return true;
      const values = data.options.map((o) => o.value.trim()).filter(Boolean);
      return values.includes(data.defaultValue.trim());
    },
    { message: "默认值必须在选项列表中", path: ["defaultValue"] }
  )
  .refine(
    (data) => {
      if (data.type !== "multi_select" || !data.defaultValue.trim()) return true;
      const values = data.options.map((o) => o.value.trim()).filter(Boolean);
      const defaults = data.defaultValue.split(",").map((v) => v.trim()).filter(Boolean);
      return defaults.every((v) => values.includes(v));
    },
    { message: "默认值中的某些值不在选项中", path: ["defaultValue"] }
  );

export type AddColumnFormValues = z.infer<typeof addColumnFormSchema>;
export type EditColumnFormValues = z.infer<typeof editColumnFormSchema>;

/** 取 zod 错误的首条友好信息 */
export function firstSchemaErrorMessage(result: z.SafeParseError<unknown>): string {
  const first = result.error.issues[0];
  return first?.message ?? "校验未通过";
}
