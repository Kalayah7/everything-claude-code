"""Pentagon contract-award event study (paper test).

The U.S. Department of Defense posts contract awards of $7.5M+ each business day
around 5 p.m. ET at https://www.defense.gov/News/Contracts/. This module:

1. ``parse_announcement`` - pulls (company, dollar amount) out of the posted text.
2. ``event_returns``      - for one award, measures what the stock did:
     * overnight: 4 p.m. close on the award day -> next day's open
                  (only capturable with whole-share limit orders after hours)
     * morning:   next day's open -> 10:30 ET bar close (fractional orders can do this)
     * day:       next day's open -> next day's close
   each also minus SPY over the same window ("excess" = beat the market or not).
3. ``summarize``          - averages, win rates, and a size filter: awards that are
                            big relative to the company's market value.

Ticker lookup (company name -> symbol) and prices come from the Robinhood
connector at run time; this module only does the math. Using these public
announcements is legal; trading on non-public contract information is not.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .data import Bar

_AMOUNT = re.compile(r"\$\s?([\d,]+(?:\.\d+)?)(\s?(?:million|billion))?", re.I)
_LEAD = re.compile(
    r"^(?P<company>[A-Z0-9][^;\n]*?),\s+[A-Z][\w .'-]+,\s+[A-Z][\w .'-]+,?\s+"
    r"(?:(?:is|was|has been|have been)\s+)?(?:awarded|received)",
)


@dataclass(frozen=True)
class Award:
    company: str
    amount: float
    text: str


def parse_amount(s: str) -> float | None:
    m = _AMOUNT.search(s)
    if not m:
        return None
    value = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").strip().lower()
    return value * {"million": 1e6, "billion": 1e9}.get(unit, 1)


def parse_announcement(text: str) -> list[Award]:
    """Split a daily contracts page into paragraphs and extract awards."""
    awards = []
    for para in (p.strip() for p in re.split(r"\n\s*\n", text)):
        m = _LEAD.match(para)
        if not m:
            continue
        amount = parse_amount(para)
        if amount:
            awards.append(Award(m.group("company").strip(), amount, para))
    return awards


@dataclass(frozen=True)
class EventResult:
    symbol: str
    award_day: str
    overnight: float
    morning: float
    day: float
    overnight_excess: float
    morning_excess: float
    day_excess: float
    award_to_mcap: float | None = None


def _window(bars: list[Bar], award_day: str):
    """(award-day last bar, next-day bars) from 5-minute bars, or None."""
    days: dict[str, list[Bar]] = {}
    for b in bars:
        days.setdefault(b.day, []).append(b)
    ordered = sorted(days)
    if award_day not in days:
        return None
    i = ordered.index(award_day)
    if i + 1 >= len(ordered):
        return None
    return days[award_day][-1], days[ordered[i + 1]]


MORNING_BAR = 11  # 12th 5-min bar closes at 10:30 ET


def _moves(bars: list[Bar], award_day: str):
    w = _window(bars, award_day)
    if not w:
        return None
    last, nxt = w
    if len(nxt) <= MORNING_BAR:
        return None
    o = nxt[0].open
    return o / last.close - 1, nxt[MORNING_BAR].close / o - 1, nxt[-1].close / o - 1


def event_returns(symbol: str, award_day: str, bars: list[Bar], spy_bars: list[Bar],
                  award_amount: float | None = None,
                  market_cap: float | None = None) -> EventResult | None:
    s, m = _moves(bars, award_day), _moves(spy_bars, award_day)
    if not s or not m:
        return None
    ratio = award_amount / market_cap if award_amount and market_cap else None
    return EventResult(symbol, award_day, *s, s[0] - m[0], s[1] - m[1], s[2] - m[2], ratio)


def summarize(results: list[EventResult], min_award_to_mcap: float = 0.0) -> dict:
    rs = [r for r in results
          if min_award_to_mcap == 0 or (r.award_to_mcap or 0) >= min_award_to_mcap]
    out = {"events": len(rs)}
    for k in ("overnight_excess", "morning_excess", "day_excess"):
        vals = [getattr(r, k) for r in rs]
        out[k] = sum(vals) / len(vals) if vals else 0.0
        out[k + "_win_rate"] = sum(v > 0 for v in vals) / len(vals) if vals else 0.0
    return out
