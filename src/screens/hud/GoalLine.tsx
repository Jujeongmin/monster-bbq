import { t } from "../../i18n";

// The first day's goal line (tutorial A, user 2026-10-20): what to do now, under the date at the top
// left; at the very top where there is no date (the night), at the top's middle in the hunt (its own HUD
// holds the top left). A new goal slides in.
// `items`: what to bring, each its picture, name and count before the words (the first hunt's lunch
// makings, user 2026-10-21: the chicken's two parts look alike, so the picture and the name both show)
export function GoalLine({ text, place, items = [] }: { text: string; place: "date" | "top" | "middle"; items?: { icon: string; text: string; done: boolean }[] }) {
  return (
    <div key={text} className={`ui-plate goal-line ${place}`} role="status">
      <span className="goal-label">{t("goal.label")}</span>
      {items.map((it) => (
        <span key={it.icon} className={`goal-item${it.done ? " done" : ""}`}>
          <img src={it.icon} alt="" />
          {it.text}
        </span>
      ))}
      {text}
    </div>
  );
}
