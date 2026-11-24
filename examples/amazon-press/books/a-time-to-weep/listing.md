# Listing: A Time to Weep

Paste these into KDP. The founder confirms keywords against Amazon's search suggestions first.

- **Title:** A Time to Weep
- **Subtitle:** Bringing Grief to God in the First Months
- **Series:** Middle Seasons, Book 3
- **Author:** (pen name from `press.config.json`)
- **Language:** English
- **Length:** about 7,500 words; about 42 pages as a 6 x 9 paperback (confirm in the KDP previewer)
- **AI-generated content question:** **Yes** (text). Scripture is quoted from the public-domain World English Bible.
- **Public domain content:** No. The book quotes short public-domain Scripture passages, but the work itself is original.
- **Adult content:** No

## Description (KDP accepts this HTML)

```html
<p><b>Someone you love has died, and the world expects you to keep going.</b></p>
<p><i>A Time to Weep</i> is a short, gentle companion for the first months of grief, written for days when you cannot concentrate for long. It will not tell you that everything happens for a reason, or how long this should take. It sits with you beside the grieving people of the Bible:</p>
<ul>
<li><b>Job's friends</b>, who got it right for seven days of silence, and wrong when they started explaining</li>
<li><b>David</b>, crying "my son, my son" for a son who had turned against him</li>
<li><b>Naomi</b>, who came home and said "call me bitter"</li>
<li><b>Rachel</b>, weeping and refusing to be comforted</li>
<li><b>Mary Magdalene</b>, weeping at the tomb until she heard her name</li>
</ul>
<p>Ten short chapters, each ending with one gentle question and a brief prayer. A page called <i>What Helps</i> for friends and family who want to support you, and a five-week guide for church grief groups.</p>
<p>A thoughtful sympathy gift for someone who is grieving.</p>
<p><i>This book is for faith and reflection. It is not counseling or medical care. Scripture quotations are from the World English Bible (public domain). Written with the help of AI tools and reviewed and edited by people.</i></p>
```

## Keywords (7 slots)

1. christian grief book
2. grieving the loss of a loved one christian
3. sympathy gift christian
4. bible comfort for grief
5. loss of a parent christian book
6. grief support group church
7. first months of grief

## Categories (choose the closest current KDP categories)

1. Religion & Spirituality > Christian Books & Bibles > Christian Living > Death & Grief
2. Religion & Spirituality > Christian Books & Bibles > Christian Living > Spiritual Growth
3. Self-Help > Death, Grief & Bereavement

## Pricing

- **Kindle eBook:** $3.99 (70% royalty band). KDP Select: yes for the first 90 days.
- **Paperback:** $7.99 to $8.99. Set it after KDP shows the printing cost.

## Files

- eBook: `dist/a-time-to-weep.epub`; paperback interior: `dist/a-time-to-weep-interior-6x9.pdf`
- eBook cover: `dist/a-time-to-weep-ebook-cover.jpg`; paperback cover: `dist/a-time-to-weep-paperback-cover.pdf`
- Build order: `node scripts/press.js build a-time-to-weep` then `node scripts/cover.js a-time-to-weep`
