import { t } from "../../i18n";

// The first day's goal line (tutorial A, user 2026-10-20): what to do now, under the date at the top
// left; at the very top where there is no date (the night), at the top's middle in the hunt (its own HUD
// holds the top left). A new goal slides in.
export function GoalLine({ text, place }: { text: string; place: "date" | "top" | "middle" }) {
  return (
    <div key={text} className={`ui-plate goal-line ${place}`} role="status">
      <span className="goal-label">{t("goal.label")}</span>
      {text}
    </div>
  );
}
