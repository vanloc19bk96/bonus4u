"""Build the NAZO BOX Listing Launchpad keyword dataset from the Publisher Rocket workbook.

    python build-keywords.py                 # writes nazo-box-keyword.json
    python build-keywords.py --check         # validate only, write nothing
    python build-keywords.py --show dropped  # list every dropped keyword and why
    python build-keywords.py --show kept     # list every kept keyword with its tags

Source: sheet "Keywords" of Murder_Nonogram_Keyword_Database.xlsx (Publisher Rocket,
Books, Amazon.com, 80 seeds, pulled 19 Nov 2026). Rocket shows "<100" searches as 99.

A keyword must describe the book truthfully. KDP's keyword rules
(kdp.amazon.com/en_US/help/topic/G201298500) also forbid misspellings, brands you
don't own and things the book isn't. So a row is dropped when it is:

  brand     someone else's brand or series (Murdle, Murdoku, Murdograms, Picross,
            Pic-a-Pix, Griddlers, "jr" = Murdle Jr...)
  bulk      a multi-book set
  off       a different puzzle format than NAZO BOX makes (search-and-find,
            names-list elimination, colour-clue nonograms, art-themed)
  fragment  Rocket cut the phrase short
  variant   the same keyword again ("a ..." / "the ..." / punctuation)

Everything else is kept, whatever its volume.

Each kept keyword gets the fields launchpad.html matches against the book:

  needs     AND-list of any-of groups. A keyword fits a book only when every group has
            a token the book has. Tokens:
              a:adults a:teens a:seniors                     who it is for
              d:easy d:hard                                  difficulty it names
              st:cozy st:noir st:coldcase st:truecrime st:spooky   mystery style
              th:christmas th:halloween                      season
              u:gift u:travel u:couples                      use
              f:large f:small                                print format
              s:vol1                                         volume 1 of a series
  nonogram  true when the keyword names the picture-logic format itself
            (nonogram, picture, visual, illustrated, hanjie...): these describe
            NAZO BOX books more exactly than a plain "mystery puzzle book".
  group     a readable family for the table filter.
  opportunity  10 x searches / competitors x (1 - competition / 100), 1 decimal.
            "<100" searches count as 50 (SEARCH_FLOOR in launchpad.html).

Upload the JSON to vanloc19bk96/affiliate-bonuses-data (master) as
nazo-box-keyword.json to update the live tool.
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
DEFAULT_XLSX = ROOT / 'Murder_Nonogram_Keyword_Database.xlsx'
OUT_JSON = ROOT / 'nazo-box-keyword.json'

SEARCH_FLOOR = 50
ROCKET_UNDER_100 = 99
KEYWORD_CHAR_LIMIT = 50

TOKENS = {
    'a:adults', 'a:teens', 'a:seniors', 'd:easy', 'd:hard',
    'st:cozy', 'st:noir', 'st:coldcase', 'st:truecrime', 'st:spooky',
    'th:christmas', 'th:halloween', 'u:gift', 'u:travel', 'u:couples',
    'f:large', 'f:small', 's:vol1',
}

EXCLUDE = [
    ('fragment', r'\b(with|for|and|to|of|in|the|a|by|on|from)$'),
    ('brand', r'murdogram|murdoku|murdle|picross|pic ?a ?pix|griddler|nightmare|hunt a killer|\bclue(do)?\b'
              r'|sherlock|agatha|christie|poirot|marple|\bjr\b|junior'),
    ('bulk', r'\bsets?\b|\bbundle|\bpack\b'),
    ('off', r'\bsearch\b|\bnames?\b|colou?r|art themed|word ?find|hidden object'),
]
EXCLUDE = [(reason, re.compile(rx)) for reason, rx in EXCLUDE]

NEED_RULES = [
    (r'\badults?\b|\bgrown ?ups?\b', ['a:adults']),
    (r'\bteens?\b|teenagers?|young adults?', ['a:teens']),
    (r'\bseniors?\b|elderly|older adults', ['a:seniors']),
    (r'beginners?|\beasy\b|starter', ['d:easy']),
    (r'expert|masters?\b|difficult|\bhard\b|challenging|advanced|extreme', ['d:hard']),
    (r'\bcos?zy\b|cosy', ['st:cozy']),
    (r'\bnoir\b', ['st:noir']),
    (r'cold case', ['st:coldcase']),
    (r'true crime', ['st:truecrime']),
    (r'spooky|horror|creepy|haunted', ['st:spooky', 'th:halloween']),
    (r'christmas|xmas|\bholiday', ['th:christmas']),
    (r'halloween', ['th:halloween']),
    (r'\bgifts?\b|stocking stuff', ['u:gift']),
    (r'travel|\bplane\b|flight|\btrain\b|road ?trip|vacation', ['u:travel']),
    (r'couples?|date night', ['u:couples']),
    (r'large print|big print|\blarge\b', ['f:large']),
    (r'pocket|travel size|\bmini\b|\bsmall\b', ['f:small']),
    (r'volume 1\b|vol 1\b|book 1\b', ['s:vol1']),
]
NEED_RULES = [(re.compile(rx), tuple(sorted(tokens))) for rx, tokens in NEED_RULES]

NONOGRAM_RX = re.compile(r'nonogram|hanjie|japanese|picture|visual|illustrated|pixel')

GROUP_NAMES = {
    'Murder mystery puzzle': 'Murder mystery puzzle book',
    'Murder mystery logic (logic-grid audience)': 'Murder mystery logic',
    'Nonogram / picture logic': 'Nonogram & picture logic',
    'Whodunit': 'Whodunit',
    'Find the killer': 'Find the killer',
    'Detective': 'Detective',
    'Crime / true crime / cold case': 'Crime, cold case & true crime',
    'Cozy mystery': 'Cozy mystery',
    'Seasonal': 'Christmas & Halloween',
    'Other': 'Murder mystery puzzle book',
}
GROUP_ORDER = ['Nonogram & picture logic', 'Murder mystery puzzle book', 'Murder mystery logic', 'Whodunit',
               'Find the killer', 'Detective', 'Crime, cold case & true crime', 'Cozy mystery',
               'Christmas & Halloween']

# Spelling fixes for display. Rocket keeps what shoppers typed; the slot should not.
FIXES = [(re.compile(r'\bwhos\b'), "who's")]


def norm_display(raw):
    text = str(raw).replace('�', "'").replace('’', "'").replace('`', "'")
    text = ' '.join(text.split()).lower()
    text = re.sub(r'(?<=[a-z])-(?=[a-z])', ' ', text)        # "find-the-killer" -> "find the killer"
    for rx, rep in FIXES:
        text = rx.sub(rep, text)
    return text


def strip_article(text):
    return re.sub(r'^(a|an|the) ', '', text)


def variant_key(text):
    t = re.sub(r"['’`]", '', strip_article(text))
    return ' '.join(t.replace('-', ' ').split())


def needs_of(kw):
    groups = {tokens for rx, tokens in NEED_RULES if rx.search(kw)}
    # Drop a group implied by a smaller one ("spooky" needs [spooky|halloween], "halloween" needs [halloween]).
    kept = []
    for g in sorted(groups, key=len):
        if not any(set(k) <= set(g) for k in kept):
            kept.append(g)
    return [list(g) for g in kept]


def opportunity_of(searches, competition, competitors):
    s = searches if searches is not None else SEARCH_FLOOR
    if not competitors:
        return 0.0
    return round(s * (1 - (competition or 0) / 100) / competitors * 10, 1)


def read_rows(xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb['Keywords']
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    expected = ['Keyword', 'Group', 'Est. Amazon Searches/Month', 'Number of Competitors', 'Competitive Score',
                'Average Price ($)', 'Average Monthly Earnings ($)', 'Average Pages']
    if header[:len(expected)] != expected:
        sys.exit(f'Unexpected header in sheet "Keywords": {header}')
    return [r for r in rows if r and r[0]]


def build(xlsx):
    dropped = Counter()
    examples = {}
    problems = []
    by_key = {}

    for raw, group, searches, competitors, comp, price, earnings, pages, *_ in read_rows(xlsx):
        kw = norm_display(raw)
        reason = next((r for r, rx in EXCLUDE if rx.search(kw)), None)
        if reason:
            dropped[reason] += 1
            examples.setdefault(reason, []).append(kw)
            continue
        if comp is None or competitors is None or searches is None:
            dropped['no data'] += 1
            continue
        searches = int(searches)
        thin = searches <= ROCKET_UNDER_100
        entry = {
            'keyword': strip_article(kw),
            'rocket_group': group,
            'searches': None if thin else searches,
            'searches_label': '<100' if thin else f'{searches:,}',
            'competition': int(comp),
            'competitors': int(competitors),
            'avg_price': round(float(price), 2) if price is not None else None,
            'avg_pages': int(pages) if pages is not None else None,
        }
        key = variant_key(kw)
        if key in by_key:
            dropped['variant'] += 1
            examples.setdefault('variant', []).append(kw)
            old = by_key[key]
            if (entry['searches'] or 0) > (old['searches'] or 0):
                by_key[key] = dict(entry, keyword=old['keyword'] if len(old['keyword']) <= len(entry['keyword']) else entry['keyword'])
            continue
        by_key[key] = entry

    keywords = []
    ordered = sorted(by_key.values(), key=lambda e: (-(e['searches'] or 0), e['competitors']))
    for i, e in enumerate(ordered, start=1):
        kw = e['keyword']
        needs = needs_of(kw)
        group = GROUP_NAMES.get(e['rocket_group'], 'Murder mystery puzzle book')
        if any(t.startswith('th:') for g in needs for t in g):
            group = 'Christmas & Halloween'
        k = {
            'id': i,
            'keyword': kw,
            'group': group,
            'searches': e['searches'],
            'searches_label': e['searches_label'],
            'competition': e['competition'],
            'competitors': e['competitors'],
            'avg_price': e['avg_price'],
            'avg_pages': e['avg_pages'],
            'opportunity': opportunity_of(e['searches'], e['competition'], e['competitors']),
            'length': len(kw),
            'needs': needs,
            'nonogram': bool(NONOGRAM_RX.search(kw)),
        }
        if k['length'] > KEYWORD_CHAR_LIMIT:
            problems.append(f'"{kw}" is over {KEYWORD_CHAR_LIMIT} characters')
        for g in needs:
            for t in g:
                if t not in TOKENS:
                    problems.append(f'"{kw}": unknown token {t}')
        keywords.append(k)

    data = {
        'product': 'NAZO BOX Listing Launchpad',
        'source': 'Publisher Rocket keyword research (Books, Amazon.com), 80 seeds, 19 Nov 2026',
        'built': date.today().isoformat(),
        'total': len(keywords),
        'keyword_char_limit': KEYWORD_CHAR_LIMIT,
        'groups': [g for g in GROUP_ORDER if any(k['group'] == g for k in keywords)],
        'keywords': keywords,
    }
    return data, dropped, examples, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', type=Path, default=DEFAULT_XLSX)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--show', choices=['dropped', 'kept', 'none'], default='none')
    args = ap.parse_args()

    data, dropped, examples, problems = build(args.xlsx)
    kws = data['keywords']
    print(f'{data["total"]} keywords kept, {sum(dropped.values())} dropped')
    for reason, n in dropped.most_common():
        print(f'  dropped {n:4d}  {reason}')
    print('groups:')
    for g in data['groups']:
        print(f'  {sum(k["group"] == g for k in kws):4d}  {g}')
    print('with needs:', sum(bool(k['needs']) for k in kws), ' nonogram:', sum(k['nonogram'] for k in kws),
          ' thin (<100):', sum(k['searches'] is None for k in kws))
    if args.show == 'dropped':
        for reason, items in examples.items():
            print(f'--- {reason}')
            for kw in items:
                print('   ', kw)
    elif args.show == 'kept':
        for k in kws:
            print(f'{k["keyword"]:<42} {k["searches_label"]:>7} {k["competitors"]:>6} {k["group"]:<30} '
                  f'{"N" if k["nonogram"] else " "} {k["needs"]}')
    for p in problems:
        print('PROBLEM:', p)
    if problems:
        sys.exit(1)
    if not args.check:
        OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        print('wrote', OUT_JSON.name, f'({OUT_JSON.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
