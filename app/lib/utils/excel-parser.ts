/**
 * Excel 解析工具
 * 将 .xlsx / .xls 文件解析为标题行和数据行
 */

export interface ParseExcelResult {
  headers: string[];
  data: unknown[][];
}

export class ExcelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelParseError";
  }
}

/**
 * 解析 Excel 文件，返回标题行和数据行
 * @param file Excel 文件
 * @returns headers 第一行非空列标题，data 数据行（不含标题）
 * @throws ExcelParseError 解析失败时
 */
export async function parseExcelFile(file: File): Promise<ParseExcelResult> {
  const XLSX = await import("xlsx");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        if (!buffer || !(buffer instanceof ArrayBuffer)) {
          reject(new ExcelParseError("读取文件失败"));
          return;
        }

        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        }) as unknown[][];

        if (!jsonData || jsonData.length < 2) {
          reject(new ExcelParseError("Excel 文件至少需要包含标题行和一行数据"));
          return;
        }

        const rawHeaders = (jsonData[0] ?? []) as unknown[];
        const headers = rawHeaders
          .filter(
            (h) =>
              h !== null &&
              h !== undefined &&
              String(h).trim() !== ""
          )
          .map((h) => String(h).trim());

        if (headers.length === 0) {
          reject(new ExcelParseError("Excel 文件的第一行（标题行）为空，请检查文件格式"));
          return;
        }

        resolve({
          headers,
          data: jsonData.slice(1),
        });
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new ExcelParseError("解析 Excel 文件失败，请检查文件格式")
        );
      }
    };

    reader.onerror = () => {
      reject(new ExcelParseError("读取文件失败"));
    };

    reader.readAsArrayBuffer(file);
  });
}
