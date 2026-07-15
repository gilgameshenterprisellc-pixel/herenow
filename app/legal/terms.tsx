import LegalDoc, { type LegalSection } from '@/components/LegalDoc'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Accepting these terms',
    body: [
      'By creating an account or using HereNow, you agree to these Terms. If you do not agree, please do not use the app.',
    ],
  },
  {
    heading: 'Who can use HereNow',
    body: [
      'You must be at least 18 years old to use HereNow. By using the app you confirm that you are.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'Give accurate information and keep your login secure. You are responsible for what happens under your account. One account per person.',
    ],
  },
  {
    heading: 'Community rules',
    body: [
      'Be respectful. No harassment, hate, threats, or illegal activity.',
      'Respect other people\'s boundaries. If someone sets their mood to Not Today, do not approach them. Consent and comfort come first.',
      'Be real. Do not impersonate anyone, and do not fake your location to check in somewhere you are not.',
      'No spam, scams, or unwanted promotion.',
      'We can remove content and suspend or remove accounts that break these rules.',
    ],
  },
  {
    heading: 'Check-ins and presence',
    body: [
      'Check-ins use your location to confirm you are at a venue. Presence is temporary and disappears when you leave. We work to keep location accuracy tight but cannot guarantee it is perfect.',
    ],
  },
  {
    heading: 'Connections and messaging',
    body: [
      'HereNow helps you connect with people you actually met. Messaging opens when a connection is confirmed and can be time-limited. We do not guarantee any particular result from using the app.',
    ],
  },
  {
    heading: 'Your content',
    body: [
      'You own the content you post. By posting it, you give us permission to display it within the app so the service can work. You are responsible for what you share, and we may remove content that breaks these rules.',
    ],
  },
  {
    heading: 'Your safety',
    body: [
      'HereNow helps you meet people in person, but we do not verify or vet users, and we are not responsible for interactions between users. Use good judgment, meet in public, and look out for yourself. Your safety is your responsibility.',
    ],
  },
  {
    heading: 'Venue accounts',
    body: [
      'Venue owners are responsible for the accuracy of their listing and the content they post, and for following these Terms.',
    ],
  },
  {
    heading: 'Service provided as is',
    body: [
      'HereNow is provided "as is" without warranties of any kind. We do our best to keep it running well but cannot promise it will always be available or error free.',
    ],
  },
  {
    heading: 'Limitation of liability',
    body: [
      'To the fullest extent allowed by law, HereNow and its team are not liable for indirect or consequential damages arising from your use of the app.',
    ],
  },
  {
    heading: 'Ending your use',
    body: [
      'You can stop using HereNow and delete your account any time. We may suspend or end access for anyone who violates these Terms.',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'We may update these Terms as the app evolves. When we do, we will change the date at the top. Continued use means you accept the current version.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'Questions about these Terms? Email us at support@herenow.app.',
    ],
  },
]

export default function TermsScreen() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="July 15, 2026"
      intro="These Terms cover your use of HereNow. Please read them. They are written to be as plain as we can make them."
      sections={SECTIONS}
    />
  )
}
