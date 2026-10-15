import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { toolQuality } from "../../../shared/growth";
import type { CookOutcome } from "../../../shared/kitchen/cook";
import type { SaveData } from "../../../shared/save";
import type { CookPlate } from "../../game/cook/CookStage";
import { CookStageGame } from "../../game/cook/CookStageGame";
import { t, type StringKey } from "../../i18n";
import { Dialogue, type DialogueLine, type LidFace } from "../dialogue/Dialogue";
import { DishIcon } from "./DishIcon";

// The research kitchen (cooking-service design 4): cook for real on the stage, put it on the plate,
// "Done". What is on the plate and the station's method go to the server as one try; its verdict comes
// back as the save's lastCook for this try's attemptId (a resent try after a lost reply carries the same
// id and is not cooked twice). How well it was cooked is shown here only (scores come with service, 05b).
export function Research({ save, act }: { save: SaveData; busy: boolean; act: (a: Action) => void }) {
  const [attempt, setAttempt] = useState<{ id: string; plate: CookPlate } | null>(null);
  const [round, setRound] = useState(0);
  const result = attempt && save.lastCook?.attemptId === attempt.id ? save.lastCook.outcome : null;
  // the lid has its say about the try first (the NPC box), then the verdict panel shows
  const [heard, setHeard] = useState<string | null>(null);
  const talk = result && attempt && heard !== attempt.id ? lidLines(result) : null;

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
      <CookStageGame items={save.items} quality={{ grill: toolQuality(save, "grill"), boil: toolQuality(save, "boil") }} round={round} onPlate={onPlate} />
      {talk && <Dialogue key={attempt!.id} lines={talk} onDone={() => setHeard(attempt!.id)} />}
      {attempt && !talk && (
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

// What the lid says about a try, and with which face (none for a dish already in the cookbook).
const HINT_FACE: Record<string, LidFace> = { method: "angry", extra: "surprised", "missing.meat": "normal", "missing.veg": "normal", "missing.sweet": "angry" };
function lidLines(outcome: CookOutcome): DialogueLine[] | null {
  if (outcome.kind === "new") return [{ who: "lid", face: "smug", text: t("kitchen.newLine") }];
  if (outcome.kind === "near") {
    const hint = outcome.hint === "missing" ? `missing.${outcome.taste}` : outcome.hint;
    return [{ who: "lid", face: HINT_FACE[hint] ?? "normal", text: t(`kitchen.hint.${hint}` as StringKey) }];
  }
  if (outcome.kind === "fail") return [{ who: "lid", face: "angry", text: t("kitchen.failLine") }];
  return null;
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
  // the lid already gave its hint in the dialogue box: the panel keeps only how it was cooked
  if (outcome.kind === "near")
    return (
      <div className="cook-result near">
        <SkillLine plate={plate} />
      </div>
    );
  return (
    <div className="cook-result fail">
      <DishIcon dish="fail" size={64} />
      <div className="cook-dish">{t(`kitchen.fail.${outcome.method}` as StringKey)}</div>

    </div>
  );
}
