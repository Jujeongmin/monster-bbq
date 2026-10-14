import { useState } from "react";
import type { Action } from "../../../shared/actions";
import type { CookOutcome } from "../../../shared/kitchen/cook";
import type { SaveData } from "../../../shared/save";
import type { CookPlate } from "../../game/cook/CookStage";
import { CookStageGame } from "../../game/cook/CookStageGame";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";

// The research kitchen (cooking-service design 4): cook for real on the stage, put it on the plate,
// "Done". What is on the plate and the station's method go to the server as one try; its verdict comes
// back as the save's lastCook for this try's attemptId (a resent try after a lost reply carries the same
// id and is not cooked twice). How well it was cooked is shown here only (scores come with service, 05b).
export function Research({ save, act }: { save: SaveData; busy: boolean; act: (a: Action) => void }) {
  const [attempt, setAttempt] = useState<{ id: string; plate: CookPlate } | null>(null);
  const [round, setRound] = useState(0);
  const result = attempt && save.lastCook?.attemptId === attempt.id ? save.lastCook.outcome : null;

  function onPlate(plate: CookPlate) {
    const id = crypto.randomUUID();
    setAttempt({ id, plate });
    act({ type: "cook", attemptId: id, items: plate.keys, method: plate.method });
  }

  function again() {
    setAttempt(null);
    setRound((r) => r + 1);
  }

  return (
    <div className="research">
      <CookStageGame items={save.items} round={round} onPlate={onPlate} />
      {attempt && (
        <div className="cook-result-wrap ui-panel">
          {result ? <CookResultView key={attempt.id} outcome={result} plate={attempt.plate} /> : <div className="cook-result">…</div>}
          <button className="ui-btn cook-again" disabled={!result} onClick={again}>
            {t("kitchen.again")}
          </button>
        </div>
      )}
    </div>
  );
}

// how well it was cooked, as 1 to 3 stars
const stars = (accuracy: number) => "★".repeat(accuracy >= 0.85 ? 3 : accuracy >= 0.55 ? 2 : 1).padEnd(3, "☆");

function SkillLine({ plate }: { plate: CookPlate }) {
  return (
    <p className="cook-skill">
      <span className="cook-stars">{stars(plate.accuracy)}</span> {plate.note && t(`cook.note.${plate.note}` as StringKey)}
    </p>
  );
}

function CookResultView({ outcome, plate }: { outcome: CookOutcome; plate: CookPlate }) {
  if (outcome.kind === "new" || outcome.kind === "known")
    return outcome.kind === "new" ? (
      <div className="cook-result new">
        <div className="cook-banner">{t("kitchen.new")}</div>
        <DishIcon dish={outcome.dish} size={96} />
        <div className="cook-dish">{t(`dish.${outcome.dish}` as StringKey)}</div>
        <SkillLine plate={plate} />
      </div>
    ) : (
      <div className="cook-result">
        <DishIcon dish={outcome.dish} size={64} />
        <div className="cook-dish">{t(`dish.${outcome.dish}` as StringKey)}</div>
        <p>{t("kitchen.known")}</p>
        <SkillLine plate={plate} />
      </div>
    );
  if (outcome.kind === "near") {
    const line = outcome.hint === "missing" ? `kitchen.hint.missing.${outcome.taste}` : `kitchen.hint.${outcome.hint}`;
    return (
      <div className="cook-result near">
        <span className="lid-name">{t("kitchen.lid")}</span>
        <p className="lid-bubble ui-bubble">{t(line as StringKey)}</p>
        <SkillLine plate={plate} />
      </div>
    );
  }
  return (
    <div className="cook-result fail">
      <DishIcon dish="fail" size={64} />
      <div className="cook-dish">{t(`kitchen.fail.${outcome.method}` as StringKey)}</div>
      <p>{t("kitchen.failLine")}</p>
    </div>
  );
}
