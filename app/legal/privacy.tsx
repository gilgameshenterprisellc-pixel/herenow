import LegalDoc, { type LegalSection } from '@/components/LegalDoc'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Information we collect',
    body: [
      'Account information you give us: your name, username, email or phone number, age range, and anything optional you add like an avatar, bio, or interests.',
      'Location: with your permission, we collect your device location, including in the background, to show you venues nearby, verify that you are actually at a venue when you check in, and update your presence. Check-in does not work without location.',
      'Activity in the app: your check-ins, your social and mood modes, the venues you visit, the connections you confirm ("We Met"), and the messages you send.',
      'Device and diagnostics: a push notification token so we can send alerts, your app version, and crash reports that help us fix problems.',
    ],
  },
  {
    heading: 'How we use your information',
    body: [
      'To run the service: show you nearby venues, confirm you are at a venue, and show your presence to other people at the same venue.',
      'To send notifications you turn on, like a confirmed connection or a new message.',
      'To keep the community safe and to diagnose and fix crashes and bugs.',
      'To understand how the app is used so we can improve it.',
    ],
  },
  {
    heading: 'How your information is shared',
    body: [
      'With other people at your venue: while you are checked in, others checked in to the same venue can see a limited version of you, shown as your first name and last initial along with your social and mood mode. This disappears when you leave.',
      'With venues: venues see aggregate, anonymized activity for their location. They never see individual profiles.',
      'With service providers who help us operate: hosting and database, crash reporting, maps and geocoding, email delivery, and push notifications. They may only use your data to provide their service to us.',
      'For legal or safety reasons if we are required to, or to protect people from harm.',
      'We do not sell your personal information.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'You can edit your profile, control what appears on your card, turn on Ghost Mode to hide yourself while still contributing anonymous venue analytics, and manage which notifications you receive, all in Settings.',
      'You can turn location off in your device settings at any time, though you will not be able to check in.',
      'You can delete your account, which permanently removes your profile, sessions, and connections. To request deletion, contact us at support@herenow.app.',
    ],
  },
  {
    heading: 'Data retention',
    body: [
      'Active check-in sessions are temporary and drop off shortly after you leave a venue. Account data is kept until you delete your account or ask us to remove it.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'We use reasonable measures to protect your data, including row-level access controls and encryption in transit. No service can promise perfect security, but we work to keep your information safe.',
    ],
  },
  {
    heading: 'Age requirement',
    body: [
      'HereNow is only for people 18 and older. We do not knowingly collect information from anyone under 18.',
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'We may update this policy as the app evolves. When we do, we will change the date at the top. Continued use of HereNow means you accept the current version.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'Questions about privacy? Email us at support@herenow.app.',
    ],
  },
]

export default function PrivacyPolicyScreen() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="July 15, 2026"
      intro="HereNow is a presence layer for going out. This policy explains what we collect, how we use it, and the choices you have. We try to keep it in plain language."
      sections={SECTIONS}
    />
  )
}
