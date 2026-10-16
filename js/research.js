/* Автоматичний точковий знімок ручних індикаторів ("Оперативна оцінка") і
   базових % по містах — пишеться на сервер щоразу, коли дані оновлюються
   (app.js викликає це після кожного успішного paint()). Сервер сам
   відкидає дублікат, якщо нічого не змінилось від попереднього знімка,
   тож повторні виклики при автооновленні без змін нічого не пишуть.
   Локальний dev-сервер цього маршруту не має — помилка тут мовчки
   ігнорується. */
import { S } from "./state.js";

export function recordOpsSnapshot(){
  if(!S.dash) return;
  const entry = {
    type: "ops-snapshot",
    targetDate: S.dash.head?.["Цільова дата"] || null,
    targetNight: S.dash.head?.["Цільова ніч"] || null,
    phase: S.dash.head?.["Фаза"] || null,
    cities: (S.dash.cities || []).map(c => ({ city: c.city, base: c.base, r56: c.r56, r90: c.r90 })),
    ops: S.ops ? { cities: S.ops.cities, rows: S.ops.rows } : null,
  };
  fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
