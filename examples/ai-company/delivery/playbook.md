# Delivery Playbook

How `company-delivery` serves every client. The goal is zero missed SLAs and zero regrettable replies.

## Onboarding (within 1 business day of payment)

1. Finance logs the payment (unverified), and the founder confirms it in Stripe.
2. Send the welcome email (below). It links the intake form and the Manager-access guide.
3. When the intake form arrives, create `delivery/clients/<client-slug>/profile.md` from the
   intake answers.
4. Draft replies to **all** currently unanswered reviews from the last 12 months (backlog). Send
   any negative ones to the client for approval.
5. Draft the first 2 Google profile posts.
6. Add the client to `finance/clients.csv` with `status=active`.

### Welcome email

> Subject: Welcome to [Company]: 2 quick steps
>
> Hi [Name], welcome aboard! Two things to get started:
>
> 1. Fill in this short form (about 5 minutes): [intake form URL]
> 2. Add us as a Manager on your Google Business Profile: search "[Business name]" on Google
>    while signed in, then choose **Edit profile > menu (three dots) > Business Profile settings >
>    People and access > Add**. Enter [company email] and choose **Manager**. You can remove us
>    anytime.
>
> (Google renames these menus from time to time. Check the path before sending and update it here.)
>
> As soon as both are done, we'll start on your unanswered reviews.

### Intake questions

1. Business name, address, phone, website, and hours
2. Main services, and the 3 you most want more customers for
3. Owner or manager name to sign replies with (for example "- Mike, Owner")
4. Tone: friendly and casual / warm and professional / formal
5. Words or topics we must **never** mention (pricing disputes, staff names, competitors, and so on)
6. How should we handle complaints? Offer a phone number or email to "make it right"?
7. Who approves negative-review replies, and by text or email?
8. Anything customers often praise or complain about?

## Daily reply cycle (every business day)

1. Check each client's profile for new reviews since the last check.
2. Draft replies into `delivery/clients/<slug>/replies/YYYY-MM-DD.md`:

```markdown
### [Reviewer first name] - [stars] stars - [date] - [link]
> [review text]

Reply:
[draft]

Status: READY TO POST | NEEDS CLIENT APPROVAL | POSTED (founder confirmed) | EDIT REQUESTED
```

3. Reviews of 4 or 5 stars: READY TO POST. Reviews of 1 to 3 stars: NEEDS CLIENT APPROVAL,
   sent to the approver.
4. The founder posts READY items and marks them POSTED.

## Reply rules

**Always**
- Use the reviewer's first name only if they show it. Thank them.
- Mention one specific detail from the review, so the reply is clearly not a template.
- Keep it short: 2 to 4 sentences for positive reviews, 3 to 5 for negative ones.
- Sign with the owner's name and title from the profile.
- Vary the wording. No two replies on a profile should start the same way.

**Never**
- Argue, blame, sound defensive, or share any customer detail (order, address, phone, visit
  date) that the reviewer did not mention publicly.
- Offer money, discounts, or gifts in a public reply, or ask anyone to remove or change a review.
- Use keyword stuffing ("best plumber in Tampa"). Write for people, not search engines.
- Mention anything on the client's never-say list.
- Healthcare, dental, legal, or financial clients: never confirm the person is a customer or patient.
  Use: "Thank you for your feedback. We take every comment seriously. Please contact our office at
  [phone] so we can help."

**Positive example (5 stars, "Mike fixed our water heater same day, super friendly")**
> Thanks so much, Sarah! Same-day fixes are what Mike lives for. We're glad your water heater is
> back in action. If anything else comes up, you know who to call. - Dave, Owner

**Negative example (1 star, "Showed up 2 hours late and didn't call")**
> James, you're right to expect a call when we're running late, and I'm sorry we didn't make one.
> That's not the standard we hold ourselves to. I'd like to hear more and make this right. Please
> call me directly at [phone]. - Dave, Owner

## Google profile posts (4 a month)

Mix these: a service highlight, a seasonal tip, a customer-praise roundup (no names), and an offer
or update the client approved. 100 to 250 words, one call-to-action button (Call or Learn more), and
a real photo from the client if possible. Save drafts in `posts/YYYY-MM.md`.

## Monthly report (by business day 3)

```markdown
# [Business] - Reviews report for [Month]
- New reviews: __ (last month: __)   Average rating this month: __   Overall: __ (__ total)
- Replies posted: __ / __ within 24h (__%)
- Profile posts published: __
- What customers praised: ...
- What customers complained about: ...
- One suggestion for next month: ...
```

Use only numbers you can see on the client's profile. After a good report, the marketer's
referral ask goes out.

## Website Sprint (3 business days after content is received)

1. Copy `delivery/website-template/index.html` to `delivery/clients/<slug>/site/index.html`.
2. Fill it in from the intake: services, hours, area, phone, address, map embed, 3 to 5 real
   reviews (quoted exactly, with first name and initial only), and real photos.
3. Check: it works at 375px wide, tap-to-call works, the contact form reaches the client's email,
   and every claim on the page is true.
4. The founder deploys it on a free static host and connects the client's domain.
5. One round of revisions within 5 business days of delivery.
