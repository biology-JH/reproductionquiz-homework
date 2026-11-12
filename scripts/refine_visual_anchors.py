#!/usr/bin/env python3
"""Refine public Chapter 16 stems and move slide figures to precise question parts.

This script only edits the public question/visual module. It never reads the
teacher answer key or any password.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "server" / "exam-content.ts"

PROMPT_UPDATES = {
    "C06i": "A labelled oxygen pulse travels from the fetus towards the placenta in a blood vessel within the umbilical cord. State one function of the umbilical cord that supports this transfer. (1)",
    "C06j": "A scan shows a fetus within a fluid-filled space enclosed by a membrane. State one protective role of the amniotic sac in this arrangement. (1)",
    "C06k": "After a small movement of the uterus, the fetus remains protected because fluid surrounds it. State one protective function of this amniotic fluid. (1)",
    "C07a": "A puberty study finds that a hormone rises in a boy before his voice deepens and facial hair develops. Identify the hormone most likely to have risen. (1)",
    "C07b": "A puberty record links breast development and pelvic widening in a girl to an increase in one sex hormone. Identify the hormone. (1)",
    "C07g": "A clinic compares growth records before and after puberty in a boy. Besides voice deepening, state one additional male secondary sexual characteristic the clinician could record as evidence of puberty. (1)",
    "C07h": "A growth survey of girls after puberty records widening of the pelvis. State one additional female secondary sexual characteristic that would support the same conclusion. (1)",
}

# (old anchor, source filename, precise question-part anchor)
FIGURE_MOVES = [
    ("C01", "sprouting_potato_stem_tubers.jpg", "C01i"),
    ("C03", "self_pollination_transfer_diagram_slide19.png", "C03a"),
    ("C03", "cross_pollination_between_plants_diagram_slide20.png", "C03a"),
    ("C03", "pollen_tube_growth_to_ovule_diagram_slide26.png", "C03b"),
    ("C04", "male_reproductive_system_anatomy_slide05.png", "C04a"),
    ("C04", "female_reproductive_system_anatomy_slide07.png", "C04g"),
    ("C05", "gamete_nuclear_fusion_zygote_diagram.png", "C05a"),
    ("C05", "sperm_cell_adaptations_slide12.png", "C05h"),
    ("C05", "egg_cell_adaptations_slide13.png", "C05h"),
    ("C07", "slide14_hormone_concentration_cycle_graph.png", "C07d"),
    ("C07", "slide15_pituitary_fsh_lh_ovary_diagram.png", "C07c"),
    ("C07", "slide16_menstrual_cycle_feedback_loop_diagram.png", "C07c"),
    ("C07c", "menstrual_cycle_menstruation_slide09.png", "C07e"),
    ("C07c", "menstrual_cycle_proliferation_slide09.png", "C07f"),
    ("C07c", "menstrual_cycle_ovulation_slide09.png", "C07d"),
    ("C07c", "menstrual_cycle_secretory_slide09.png", "C07f"),
    ("C08", "hiv_transmission_routes_slide12.png", "C08d"),
    ("C08", "sti_control_measures_slide17.png", "C08g"),
    ("C08", "condom_barrier_method_slide19.png", "C08g"),
    ("C08", "hormonal_contraceptive_pills_slide19.jpg", "C08h"),
    ("E02", "strawberry_horizontal_runner_diagram.png", "E02a"),
    ("E02", "sprouting_potato_stem_tubers.jpg", "E02d"),
    ("E03", "self_pollination_transfer_diagram_slide19.png", "E03a"),
    ("E03", "cross_pollination_between_plants_diagram_slide20.png", "E03b"),
    ("E03", "pollen_tube_growth_to_ovule_diagram_slide26.png", "E03e"),
    ("E05", "slide14_hormone_concentration_cycle_graph.png", "E05a"),
    ("E05", "slide16_menstrual_cycle_feedback_loop_diagram.png", "E05d"),
    ("E05", "slide15_pituitary_fsh_lh_ovary_diagram.png", "E05c"),
    ("E06", "meiosis_fertilisation_ploidy_cycle.png", "E06a"),
    ("E06", "strawberry_horizontal_runner_diagram.png", "E06c"),
    ("E07", "slide14_hormone_concentration_cycle_graph.png", "E07a"),
    ("E07", "slide16_menstrual_cycle_feedback_loop_diagram.png", "E07b"),
    ("E07", "self_pollination_transfer_diagram_slide19.png", "E07c"),
    ("E07", "cross_pollination_between_plants_diagram_slide20.png", "E07c"),
    ("E07", "meiosis_fertilisation_ploidy_cycle.png", "E07d"),
    ("E07", "slide15_pituitary_fsh_lh_ovary_diagram.png", "E07e"),
]


def literal_span(source: str, declaration: str, opener: str) -> tuple[int, int, object]:
    decl = source.index(declaration)
    begin = source.index(opener, source.index("=", decl))
    closer = "]" if opener == "[" else "}"
    depth = 0
    in_string = False
    escaped = False
    for pos in range(begin, len(source)):
        char = source[pos]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                end = pos + 1
                return begin, end, json.loads(source[begin:end])
    raise ValueError(f"Could not parse {declaration}.")


def move_image(visuals: dict, old_anchor: str, filename: str, target_anchor: str) -> None:
    src = f"/figures/{filename}"
    old_images = visuals.get(old_anchor, {}).get("images", [])
    target_meta = visuals.setdefault(target_anchor, {"images": []})
    target_images = target_meta.setdefault("images", [])
    old_matches = [image for image in old_images if image.get("src") == src]
    target_matches = [image for image in target_images if image.get("src") == src]
    if not old_matches and len(target_matches) == 1:
        return
    if len(old_matches) != 1 or target_matches:
        raise ValueError(f"Unexpected figure-anchor state for {filename}: {old_anchor} -> {target_anchor}.")
    image = old_matches[0]
    old_images.remove(image)
    target_images.append(image)


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    q_begin, q_end, questions = literal_span(source, "export const examQuestions", "[")
    v_begin, v_end, visuals = literal_span(source, "export const examVisuals", "{")
    question_by_id = {question["id"]: question for question in questions}
    if len(question_by_id) != len(questions):
        raise ValueError("The public bank already contains duplicate IDs.")

    for question_id, new_prompt in PROMPT_UPDATES.items():
        if question_id not in question_by_id:
            raise ValueError(f"Missing expected question {question_id}.")
        question_by_id[question_id]["prompt"] = new_prompt

    e07c = question_by_id["E07c"]["prompt"]
    old_lead = "Figures A and B show two pollen-transfer routes."
    if old_lead in e07c:
        question_by_id["E07c"]["prompt"] = e07c.replace(
            old_lead, "The two pollen-transfer figures show distinct routes.", 1
        )
    elif "The two pollen-transfer figures show distinct routes." not in e07c:
        raise ValueError("Unexpected E07c figure-reference wording.")

    for old_anchor, filename, target_anchor in FIGURE_MOVES:
        if target_anchor not in question_by_id:
            raise ValueError(f"Missing figure target question {target_anchor}.")
        move_image(visuals, old_anchor, filename, target_anchor)

    for anchor in list(visuals):
        if not visuals[anchor].get("images"):
            del visuals[anchor]
    for anchor, metadata in visuals.items():
        for image in metadata.get("images", []):
            asset_path = ROOT / "public" / image["src"].lstrip("/")
            if not asset_path.is_file():
                raise FileNotFoundError(f"Missing supplied-slide image: {image['src']}")
    if any("C02u" == question["id"] for question in questions):
        raise ValueError("The removed drawing question C02u must not be restored.")

    # Replacing the later visual literal first preserves the question-array offsets.
    source = source[:v_begin] + json.dumps(visuals, ensure_ascii=False, indent=2) + source[v_end:]
    source = source[:q_begin] + json.dumps(questions, ensure_ascii=False, indent=2) + source[q_end:]
    temporary = SOURCE.with_suffix(".ts.tmp")
    temporary.write_text(source, encoding="utf-8")
    temporary.replace(SOURCE)
    print(json.dumps({"updated_prompts": sorted(PROMPT_UPDATES), "figure_reanchors": len(FIGURE_MOVES), "answer_data_touched": False}, indent=2))


if __name__ == "__main__":
    main()
