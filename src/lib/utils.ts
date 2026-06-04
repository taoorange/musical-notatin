/** 后端常见输入：时间戳字符串、ISO Z、普通日期字符串、Date */
export type DateInput = string | number | Date | null | undefined;

const MS_PER_HOUR = 3_600_000;
const CHINA_UTC_OFFSET_HOURS = 8;

const pad = (value: number, length: number): string =>
  String(value).padStart(length, "0");

const isIsoUtcString = (value: string): boolean =>
  value.includes("T") && value.includes("Z");

const isNumericString = (value: string): boolean => /^\d+$/.test(value);

function parseDate(input: DateInput): Date | null {
  if (input == null || input === "") return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === "number") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const str = String(input);
  if (isNumericString(str)) {
    const date = new Date(Number(str));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatChineseDate(date: Date, useUtcPlus8: boolean): string {
  const shifted = useUtcPlus8
    ? new Date(date.getTime() + CHINA_UTC_OFFSET_HOURS * MS_PER_HOUR)
    : date;

  const year = useUtcPlus8 ? shifted.getUTCFullYear() : shifted.getFullYear();
  const month = (useUtcPlus8 ? shifted.getUTCMonth() : shifted.getMonth()) + 1;
  const day = useUtcPlus8 ? shifted.getUTCDate() : shifted.getDate();

  return `${year}年${pad(month, 2)}月${pad(day, 2)}日`;
}

function formatWithPattern(date: Date, pattern: string, useUtcPlus8: boolean): string {
  const shifted = useUtcPlus8
    ? new Date(date.getTime() + CHINA_UTC_OFFSET_HOURS * MS_PER_HOUR)
    : date;

  const parts = useUtcPlus8
    ? {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
        ms: shifted.getUTCMilliseconds(),
      }
    : {
        year: shifted.getFullYear(),
        month: shifted.getMonth() + 1,
        day: shifted.getDate(),
        hour: shifted.getHours(),
        minute: shifted.getMinutes(),
        second: shifted.getSeconds(),
        ms: shifted.getMilliseconds(),
      };

  let result = pattern;

  result = result.replace(/(y+)/, (_, token: string) =>
    String(parts.year).slice(4 - token.length),
  );

  const tokenMap: Record<string, number> = {
    "M+": parts.month,
    "d+": parts.day,
    "H+": parts.hour,
    "m+": parts.minute,
    "s+": parts.second,
    "S+": parts.ms,
  };

  for (const [token, value] of Object.entries(tokenMap)) {
    result = result.replace(new RegExp(`(${token})`), (match) =>
      match.length === 1 ? String(value) : pad(value, match.length),
    );
  }

  return result;
}

/**
 * 将日期格式化为指定模式，默认 `yyyy-MM-dd`。
 * - ISO `...T...Z`：按 UTC+8 显示（兼容原逻辑）
 * - 纯数字字符串：按毫秒时间戳解析
 * - `zh === true`：输出 `yyyy年MM月dd日`
 */
export function dateFormat(
  date: DateInput,
  fmt?: string,
  zh?: boolean,
): string {
  if (date == null || date === "") return "";

  const parsed = parseDate(date);
  if (!parsed) return "";

  const useUtcPlus8 =
    typeof date === "string" && isIsoUtcString(date);

  if (zh) {
    return formatChineseDate(parsed, useUtcPlus8);
  }

  return formatWithPattern(parsed, fmt ?? "yyyy-MM-dd", useUtcPlus8);
}
