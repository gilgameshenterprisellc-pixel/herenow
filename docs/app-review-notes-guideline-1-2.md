# App Review notes: Guideline 1.2 (User Generated Content)

Paste the text between the lines into App Store Connect, either under
**App Review Information > Notes** or in the reply to the rejection. It is
written so the reviewer can find every control without guessing. The paths below
were checked against the code on October 1 2026.

Run these in Supabase first, in this order, or the demo account will be empty
and block/report will not behave as described:

1. `supabase/apple_1_2_block_enforcement_and_ugc_controls.sql`
2. `supabase/apple_demo_safety_content.sql`

---

HereNow is 18+ only (age rating set to 18+ in App Store Connect, and every new account confirms they are 18 or older). This note shows where each Guideline 1.2 precaution lives. Sign in with the demo account in the Sign-In Information fields. The Nearby tab opens straight to the venue "The Lantern Room", which is already populated. Open it, tap Check In, choose any Social Mode and Mood, and you will see the Pulse, Chat, People, Board and Events tabs.

1. Users agree to terms with no tolerance for objectionable content or abusive users. At sign-up (Person or Venue) the user must tick: "I'm 18 or older", agreement to the Terms of Service and Privacy Policy "including that HereNow has no tolerance for objectionable content or abusive users", and agreement to the Community Guidelines. Accounts that have not agreed to the current version (the demo account, for example) see a full-screen "Our terms have been updated" agreement the first time they open the app. The full text is in Settings > Privacy > Terms of Service (section "Zero tolerance for objectionable content and abusive users") and Community Guidelines.

2. Filtering objectionable content. Text with profanity or slurs is rejected at the moment of posting everywhere users can write: Pulse, Chat, the Board, Board responses, direct messages, profile fields, events and venue announcements. Try posting a slur in Chat and it will not send. Photos (profile pictures, Pulse, Board and venue photos) are screened by an automated image filter at upload and rejected if explicit, graphic or offensive; any photo can also be reported, and a reported photo is hidden immediately.

3. Flagging objectionable content. Every message, post, pin and conversation has a visible control:
   - Chat tab: tap the "..." button beside any message, then "Report this message" and choose a reason. The message is hidden immediately.
   - Pulse tab: tap the flag on another person's post, then "Report this post".
   - Board tab: tap "Report" under any pin, then "Report this pin". This works on anonymous pins too, and the pin disappears for you right away.
   - People tab: tap the "..." on a person's card, then Report (the card menu is shown on other people's cards only).
   - Messages: open a conversation and tap "..." (direct messages) or the flag icon (Board responses), then "Report this person".
   - Profiles: open anyone's profile (tap a name in Messages or My Circle) and tap "..." in the top right, then "Report this person".

4. Blocking abusive users. The same menus have a Block option: Chat ("Block Guest N"), Pulse ("Block" on a post), Board ("Block this poster", which works on anonymous posters without revealing who they are), People cards, and every conversation. Profiles have the same menu. Blocking is enforced in the database: blocked people disappear from Pulse, Chat, People, the Board and each other's profiles, and neither person can send a We Met request, a My Circle request or a message to the other. Settings > Safety > Blocked Users lists everyone you have blocked and lets you unblock.

5. Removing your own content from the feed immediately. Chat: "..." beside your own message, then "Delete message". Pulse: the X on your own post. Board: "..." on your own pin, then "Remove Pin".

6. Acting on reports within 24 hours. Every report appears in an admin review queue, and every report sends an in-app alert to the admin accounts. An admin can restore or remove the content and suspend the account. A suspended account is signed out, cannot sign back in, and cannot post anywhere, including anonymous areas. The Terms and Community Guidelines state this 24-hour commitment to users.

7. Contact information in the app. Settings > Help > Contact Support and Settings > Safety > Report Abuse both email support@herenowsocial.com. The address is also printed in the Terms, Community Guidelines and Privacy Policy.

Anonymous content: Venue Chat shows senders as "Guest N", and Board pins can be posted anonymously. Anonymity only hides a name from other users. The account is always known to us, so reports, blocks, removals and suspensions all work on anonymous content exactly as they do on named content.

---

## For you (not part of the paste)

- Photo screening needs two one-time steps outside the app: create a free Sightengine account, then run `supabase functions deploy moderate-image` and `supabase secrets set SIGHTENGINE_USER=... SIGHTENGINE_SECRET=...`. Until that is done the app still works and relies on report and auto-hide. Do not paste the photo-screening sentence into the review notes until it is deployed.
- App Store Connect > your app > **App Information** > **License Agreement**: either keep Apple's standard EULA or choose **Custom** and paste the Terms of Service, which now contain the zero-tolerance section. Add `https://herenowsocial.com/legal/terms` to the description as well if you want it visible on the product page.
- The in-app screens read `herenowsocial.com/legal/terms` and `/legal/community` from the web build, so deploy the web build after merging, or the public pages will still show the old text.
