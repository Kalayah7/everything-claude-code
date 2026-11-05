# Email Setup for the Mailer (one time, about 30 to 45 minutes)

The mailer sends from **your own business mailbox**, using standard SMTP to send and IMAP to
read replies. These steps assume Google Workspace. Microsoft 365 and Zoho notes are at the end.
Provider menus change over time, so if a step looks different, search the provider's help for
the named setting.

## 1. Decide which domain sends

Recommended: a **second domain only for outreach**, for example `getbrightside.com` if your site is
`brightside.com`. If cold emails ever hurt a domain's reputation, your main domain and its
client email are protected. It costs about $12/year plus one extra mailbox.

Either way, the sending address should be a real person's mailbox, for example `sam@...`, that you
read and reply from.

## 2. Create the mailbox (Google Workspace, about $7/user/month)

Sign up at workspace.google.com with the sending domain, create your user, and verify the domain
when Google asks you to.

## 3. DNS records (at your domain registrar, about 15 minutes)

These three records tell other mail servers that your emails are really from you. Without them,
most cold emails land in spam.

| Record | What to add | Where to get the value |
|---|---|---|
| **SPF** | TXT on `@`: `v=spf1 include:_spf.google.com ~all` | Use this exact value for Google. Keep only one SPF record per domain |
| **DKIM** | TXT on `google._domainkey` | Google Admin console: Apps > Google Workspace > Gmail > Authenticate email > Generate new record, add it at the registrar, then click **Start authentication** |
| **DMARC** | TXT on `_dmarc`: `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` | Start with `p=none`. After a month with no problems, consider `p=quarantine` |

Check them by sending an email to a Gmail address you own. Open it, choose **Show original**, and
look for `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.

## 4. App password (about 5 minutes)

1. Turn on 2-Step Verification for the account (myaccount.google.com > Security).
2. Create an app password (myaccount.google.com > Security > App passwords) named "mailer".
   If the option is missing, your Workspace admin settings may block app passwords. As the admin,
   allow it in the Admin console under Security.
3. In Gmail settings, make sure IMAP is enabled (See all settings > Forwarding and POP/IMAP).

## 5. Give the mailer the credentials (on your computer, never in chat)

Create the file `examples/ai-company/.env`. It is git-ignored and never committed:

```
MAILER_USER=sam@getbrightside.com
MAILER_PASS=the-16-character-app-password
```

Do not paste the password into the Claude chat. Type it into the file yourself.

## 6. Fill in the mailer settings in `company.config.json`

```json
"mailer": {
  "enabled": true,
  "provider": "google",
  "fromName": "Sam Rivera",
  "fromEmail": "sam@getbrightside.com",
  "timezone": "America/New_York"
}
```

Leave the limits as they are at first: warm-up 10/20/30 a day, at most 40 a day, and 1 to 3
minutes between emails.

## 7. Test

```bash
cd examples/ai-company
npm install                              # once
node scripts/mailer.js test-connection   # logs in to SMTP and IMAP, sends nothing
node scripts/mailer.js status
```

For a first real test, put a batch with one message to **your own personal email** in
`sales/outbox/`, then approve it and `send --live`. Check that it arrived in the inbox (not spam)
and that SPF, DKIM and DMARC say PASS.

## Other providers

- **Zoho Mail:** set `"provider": "zoho"`, create an app-specific password in Zoho's security
  settings, and use Zoho's DKIM and SPF values instead of Google's.
- **Microsoft 365:** set `"provider": "microsoft"`. Microsoft has been retiring password-based
  SMTP sign-in for Exchange Online, so SMTP AUTH may be blocked for your tenant. If
  `test-connection` fails with an authentication error, use Google Workspace or Zoho instead.
- **Do not use** SendGrid, Mailgun, Postmark or Amazon SES for this. Their terms generally prohibit
  cold outreach.

## Keep it healthy

- Watch for the mailer pausing itself. It pauses at more than 5% bounces, or on any spam complaint.
- Reply to interested prospects quickly. Real two-way conversations help your sender reputation.
- If replies drop sharply, check that you're landing in the inbox (step 3) before sending more.
