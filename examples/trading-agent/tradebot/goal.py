"""Income-goal math: how much capital a monthly target really needs."""

from __future__ import annotations

import argparse

# Monthly return bands (sustained, after costs).
PLAUSIBLE = 0.01      # ~12.7%/yr: already better than most professionals over time
AGGRESSIVE = 0.03     # ~42.6%/yr: rarely sustained; large drawdowns are likely


def capital_required(monthly_target: float, monthly_return: float) -> float:
    """Capital needed to earn ``monthly_target`` at a steady ``monthly_return`` (0.01 = 1%)."""
    if monthly_return <= 0:
        raise ValueError("monthly_return must be positive")
    if monthly_target < 0:
        raise ValueError("monthly_target must be non-negative")
    return monthly_target / monthly_return


def implied_monthly_return(monthly_target: float, capital: float) -> float:
    """Monthly return that ``capital`` must earn to reach ``monthly_target``."""
    if capital <= 0:
        raise ValueError("capital must be positive")
    return monthly_target / capital


def classify(monthly_return: float) -> str:
    if monthly_return <= PLAUSIBLE:
        return "plausible"
    if monthly_return <= AGGRESSIVE:
        return "aggressive"
    return "unrealistic"


def annualized(monthly_return: float) -> float:
    return (1 + monthly_return) ** 12 - 1


def _fmt_annual(monthly_return: float) -> str:
    a = annualized(monthly_return)
    return ">10,000%" if a > 100 else f"{a:.0%}"


def report(monthly_target: float, capital: float | None = None) -> str:
    lines = [f"Monthly target: ${monthly_target:,.0f}", ""]
    lines.append("Capital required at a steady monthly return:")
    for r in (0.005, 0.01, 0.02, 0.03, 0.05):
        lines.append(
            f"  {r:>5.1%}/mo ({annualized(r):>6.1%}/yr, {classify(r):<11}) -> "
            f"${capital_required(monthly_target, r):>16,.0f}"
        )
    if capital:
        r = implied_monthly_return(monthly_target, capital)
        lines += [
            "",
            f"With ${capital:,.0f} you need {r:.2%}/mo ({_fmt_annual(r)}/yr): {classify(r).upper()}",
        ]
        if classify(r) != "plausible":
            lines.append(
                f"  Plausible interim target at 1%/mo: ${capital * PLAUSIBLE:,.0f}/mo. "
                "Do not close the gap with leverage."
            )
    lines += ["", "No strategy guarantees a minimum monthly income."]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--target", type=float, required=True, help="monthly $ target")
    p.add_argument("--capital", type=float, help="capital you can trade")
    a = p.parse_args(argv)
    print(report(a.target, a.capital))


if __name__ == "__main__":
    main()
