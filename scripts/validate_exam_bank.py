#!/usr/bin/env python3
"""Validate public Chapter 16 question tracks without opening private keys."""
from __future__ import annotations
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'server' / 'exam-content.ts'
COVERAGE = ROOT / 'Chapter16_Syllabus_Coverage.md'


def parse_literal(source: str, declaration: str, opener: str):
    start = source.index(declaration)
    begin = source.index(opener, source.index('=', start))
    closer = ']' if opener == '[' else '}'
    depth = 0
    quoted = False
    escaped = False
    for pos in range(begin, len(source)):
        char = source[pos]
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return json.loads(source[begin:pos + 1])
    raise ValueError(f'Unable to parse {declaration}.')


def coverage_question_ids() -> set[str]:
    if not COVERAGE.is_file():
        raise FileNotFoundError(f'Missing syllabus crosswalk: {COVERAGE}')
    pattern = re.compile(r'\b([CE]\d{2})([a-z])(?:[–-]([a-z]))?\b')
    mapped: set[str] = set()
    for line in COVERAGE.read_text(encoding='utf-8').splitlines():
        if not line.startswith('| **'):
            continue
        cells = line.strip('|').split('|')
        for cell in cells[1:3]:
            for prefix, first, last in pattern.findall(cell):
                end = last or first
                if ord(end) < ord(first):
                    raise ValueError(f'Reversed question-ID range in crosswalk: {prefix}{first}–{end}')
                mapped.update(f'{prefix}{chr(letter)}' for letter in range(ord(first), ord(end) + 1))
    return mapped


def number_for(question: dict, track: str) -> int:
    match = re.match(r'^Paper\s+(\d+)', question['paper'])
    if not match:
        raise ValueError(f'Missing paper number: {question["id"]}')
    number = int(match.group(1))
    if track == 'Extended' and question['section'] == 'Core':
        number = {1: 2, 3: 4}.get(number, number)
    return number


def validate_track(questions: list[dict], visuals: dict, track: str) -> dict:
    selected = [q for q in questions if track == 'Extended' or q['section'] == 'Core']
    order = {q['id']: index for index, q in enumerate(selected)}
    selected.sort(key=lambda q: (0 if q['section'] == 'Core' else 1, number_for(q, track), order[q['id']]))
    ids, prompts, sources = set(), set(), []
    displayed_sources = set()
    counts = Counter()
    marks_by_paper = Counter()
    for q in selected:
        if q['id'] in ids:
            raise ValueError(f'{track}: duplicate ID {q["id"]}')
        ids.add(q['id'])
        prompt = re.sub(r'\s+', ' ', q['prompt'].lower()).strip()
        if prompt in prompts:
            raise ValueError(f'{track}: exact duplicate prompt at {q["id"]}')
        prompts.add(prompt)
        if re.search(r'\b(?:draw|drawing|sketch|sketching)\b', q['prompt'], re.I):
            raise ValueError(f'{track}: drawing/sketch task at {q["id"]}')
        if any(field in q for field in ('answer', 'accept', 'groups', 'rubric')):
            raise ValueError(f'{track}: private answer field leaked into {q["id"]}')
        counts[q['section']] += 1
        marks_by_paper[number_for(q, track)] += int(q['marks'])
        local_images = visuals.get(q['id'], {}).get('images', [])
        shared_images = visuals.get(q.get('main'), {}).get('images', []) if q.get('main') != q['id'] else []
        for image in [*local_images, *shared_images]:
                src = image['src']
                if not (ROOT / 'public' / src.lstrip('/')).is_file():
                    raise FileNotFoundError(f'Missing original figure: {src}')
                if src not in displayed_sources:
                    displayed_sources.add(src)
                    sources.append(src)
    if len(sources) != len(displayed_sources):
        raise ValueError(f'{track}: one or more source images repeat within the track')
    if track == 'Extended':
        saw_supplement = False
        for q in selected:
            if q['section'] == 'Extended':
                saw_supplement = True
            elif saw_supplement:
                raise ValueError('Extended ordering is not Core-first.')
    return {
        'questions': len(selected),
        'marks': sum(int(q['marks']) for q in selected),
        'tier_counts': dict(counts),
        'paper_mark_totals': dict(sorted(marks_by_paper.items())),
        'unique_original_images': len(displayed_sources),
    }


def main():
    source = SOURCE.read_text(encoding='utf-8')
    questions = parse_literal(source, 'export const examQuestions', '[')
    visuals = parse_literal(source, 'export const examVisuals', '{')
    question_ids = {q['id'] for q in questions}
    if len(questions) != 137 or len(question_ids) != 137:
        raise ValueError('Expected 137 distinct revised question IDs.')
    mapped_ids = coverage_question_ids()
    missing_ids = sorted(question_ids - mapped_ids)
    unknown_ids = sorted(mapped_ids - question_ids)
    if missing_ids or unknown_ids:
        raise ValueError(f'Syllabus crosswalk mismatch: missing={missing_ids}, unknown={unknown_ids}')
    result = {
        'Core': validate_track(questions, visuals, 'Core'),
        'Extended': validate_track(questions, visuals, 'Extended'),
        'drawing_question_removed': all(q['id'] != 'C02u' for q in questions),
        'syllabus_question_ids_mapped': len(mapped_ids),
    }
    if result['Core']['questions'] != 104 or result['Core']['marks'] != 109:
        raise ValueError('Core totals do not match the approved track specification.')
    if result['Extended']['questions'] != 137 or result['Extended']['marks'] != 178:
        raise ValueError('Extended totals do not match the approved track specification.')
    if result['Core']['paper_mark_totals'] != {1: 10, 3: 92, 6: 7}:
        raise ValueError('Core paper mark totals do not match the coverage map.')
    if result['Extended']['paper_mark_totals'] != {2: 16, 4: 153, 6: 9}:
        raise ValueError('Extended paper mark totals do not match the coverage map.')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
