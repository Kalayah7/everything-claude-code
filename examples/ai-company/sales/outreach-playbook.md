# Outreach Playbook

`company-sales` personalizes these templates for each prospect. The founder sends them. Text in
`[brackets]` must be replaced. Never send a message that still has brackets in it.

## Rules for every message

- Personal and specific: mention the business by name and quote or summarize their real reviews.
- Lead with free value: the draft replies are theirs to use, whether they buy or not.
- One small ask: a reply, or a 15-minute call. Never "buy now" in the first message.
- Email footer (required): your name, company, postal address, and the opt-out line.
- Stop after 2 follow-ups. "No" and "stop" are final. Mark `unsubscribed=yes` the same day.

Email footer:

```
[Founder name] | [Company name]
[Postal address]
Not interested? Reply "no thanks" and I won't email again.
```

---

## 1. First email: value-first audit

**Subject:** [3] reviews for [Business name] are waiting on a reply

> Hi [Owner first name, or "there"],
>
> I was looking at [Business name]'s Google reviews. Customers clearly love [specific praise from
> reviews, e.g. "how fast Mike shows up"]. I noticed [N] of your most recent reviews don't have a
> reply yet, including [reviewer first name]'s from [timeframe].
>
> I wrote replies you can copy and post today, free:
>
> **[Reviewer 1] ([stars] stars):** "[short quote]"
> Reply: [draft reply]
>
> **[Reviewer 2] ([stars] stars):** "[short quote]"
> Reply: [draft reply]
>
> I run [Company name]. We reply to every review for local businesses within 24 hours, for
> $[price]/month. You approve anything negative before it posts. If you'd like to stop thinking
> about reviews, I'm happy to show you how it works in 15 minutes. If not, enjoy the replies.
>
> [Footer]

## 2. Follow-up, day 3

**Subject:** Re: [3] reviews for [Business name] are waiting on a reply

> Hi [Name], just making sure this reached you. The replies above are ready to paste. If someone
> else handles your Google profile, could you forward this to them?
>
> [Footer]

## 3. Follow-up, day 7 (last)

**Subject:** Re: [3] reviews for [Business name] are waiting on a reply

> Hi [Name], last note from me. You got [N] new reviews since I wrote. If you ever want them
> handled automatically, here's the page: [site URL]. Either way, all the best with [Business name].
>
> [Footer]

---

## 4. Walk-in script (best channel for local businesses)

Bring a printed **one-page review audit**: the business's rating, number of unanswered reviews,
and 3 printed draft replies. Build it from `sales/review-audit-template.html`. Save each one as
`sales/outbox/audits/<business-slug>.html` (git-ignored), then print, or save as a PDF to attach to email. Visit mid-morning or mid-afternoon on a weekday, not at rush time.

> "Hi, is the owner or manager around? I'll be quick. I help local businesses with their Google
> reviews. I noticed [Business] has [N] reviews without a reply, so I wrote replies you can post.
> This is yours to keep, no charge. If you ever want us to handle it every week, my number's on
> the bottom. It's $[price] a month, cancel anytime."

If the owner is interested: "Can I grab 15 minutes later this week to show you how it works?"
Then book it on the spot.

## 5. Phone script (manual call to the published business number)

> "Hi, this is [Name] with [Company], a local company. Is this a good minute, or should I call back?
> I noticed [Business] has [N] Google reviews without a reply, and I already wrote replies for
> them. Can I email them to you? No charge."

Get the email, send template 1 within the hour, and log `contacted_on`.
If they say "don't call," apologize, end the call, and mark `unsubscribed=yes`.

## 6. 15-minute sales call

1. **(2 min) Their situation.** "How do you handle reviews today? Who does it?"
2. **(3 min) Show the audit.** Their unanswered reviews, and how a competitor replies.
3. **(4 min) How it works.** Intake, Manager access (no password), replies within 24h,
   negative-review approvals by text or email, and the monthly report.
4. **(3 min) Price and risk.** "$[price] a month, no contract, and the first month is refundable."
5. **(3 min) Close.** "Want me to start today? I'll send the link now. Setup takes about
   15 minutes on your side."

Send the Autopilot Payment Link during the call. After payment, Stripe sends them to the intake form.

## 7. Objections

| They say | You say |
|---|---|
| "I don't have time." | "That's exactly why we exist. After a 15-minute setup, you only approve the occasional negative-review reply." |
| "I can reply myself." | "You can, and the replies I sent are yours. Most owners mean to and don't. We make sure it happens within 24 hours, every time." |
| "Is this AI?" | "AI helps us draft. Every reply follows your tone and your never-say list, and you approve anything negative." |
| "Too expensive." | "What's one new customer worth to you? If the service brings in even one extra job a month, it has paid for itself. And month one is refundable." |
| "Can you get us more 5-star reviews?" | "We give you a QR card and simple templates to ask every customer for a review. We never write or buy reviews. That's illegal and against Google's rules." |
| "Send me info." | "Sure, what's the best email? I'll include a link to the page and 2 more replies for your newest reviews." |

## 8. Proposal email (after the call)

**Subject:** [Business name] + [Company]: getting started

> Hi [Name], thanks for the time today. Here's the summary:
>
> - Every Google review answered within 24 hours. Negative ones wait for your approval.
> - 4 Google profile posts a month, and a monthly report.
> - $[price]/month, cancel anytime, first month refundable within 30 days.
>
> Start here: [Autopilot Payment Link]
> After checkout you'll get a short intake form. I'll take it from there.
>
> [Footer]
