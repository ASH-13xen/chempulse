import type { AlertRule } from "@/components/providers/settings";
import type { Row } from "./types";

export const METRIC_LABEL: Record<AlertRule["metric"], string> = {
  last: "Price",
  d1: "1-day change",
  w1: "1-week change",
  m1: "1-month change",
  m3: "3-month change",
  y1: "1-year change",
};

export function ruleValue(rule: AlertRule, row: Row | undefined) {
  if (!row) return null;
  return rule.metric === "last" ? row.last : row.changes[rule.metric];
}

export function ruleHit(rule: AlertRule, row: Row | undefined) {
  const v = ruleValue(rule, row);
  if (v == null) return false;
  return rule.op === ">" ? v > rule.value : v < rule.value;
}
