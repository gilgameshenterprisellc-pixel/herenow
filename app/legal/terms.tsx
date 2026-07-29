import LegalDoc, { type LegalSection } from '@/components/LegalDoc'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Who can use HereNow',
    body: [
      'You must be at least 18 years old to create an account or use HereNow.',
      'By using HereNow, you represent that:',
      { bullets: [
        'You are at least 18 years old.',
        'The information you provide is accurate and current.',
        'You are legally permitted to use the service.',
        'You will comply with these Terms and all applicable laws.',
      ] },
      'We may suspend or terminate accounts that do not meet these requirements.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'You are responsible for maintaining the security of your account.',
      'You agree to:',
      { bullets: [
        'Keep your account information accurate and up to date.',
        'Keep your login credentials secure.',
        'Notify us promptly if you believe your account has been compromised.',
        'Use only one personal account unless we expressly authorize otherwise.',
      ] },
      'You are responsible for activity that occurs under your account.',
    ],
  },
  {
    heading: 'License to use HereNow',
    body: [
      'Subject to these Terms, HereNow grants you a limited, non-exclusive, non-transferable, revocable license to use the platform for your personal, non-commercial use.',
      'This license does not transfer ownership of HereNow or any of its intellectual property.',
    ],
  },
  {
    heading: 'Community rules',
    body: [
      'HereNow is built around respectful, real-world interactions. By using HereNow, you agree to treat other users respectfully and use the platform responsibly.',
      'You may not:',
      { bullets: [
        'Harass, threaten, stalk, intimidate, or abuse another person.',
        'Promote hate, discrimination, violence, or illegal activity.',
        'Impersonate another person, organization, or business.',
        'Create fake accounts or provide false information.',
        'Falsify your location or attempt to check into places where you are not physically present.',
        'Attempt to bypass or interfere with HereNow\'s geofencing or location verification systems.',
        'Spam users or send unwanted promotional content.',
        'Upload malicious software or attempt to compromise the security of the platform.',
        'Use bots, scripts, automation, or scraping tools without permission.',
        'Collect or harvest information about other users without authorization.',
        'Attempt unauthorized access to HereNow or its systems.',
      ] },
      'We may remove content, suspend accounts, or permanently terminate accounts that violate these Terms or threaten the safety of the community.',
    ],
  },
  {
    heading: 'Check-ins and presence',
    body: [
      'HereNow uses your device\'s location to verify that you are physically present at participating venues. Check-ins are temporary and automatically end when your visit concludes.',
      'Location accuracy depends on factors outside of HereNow\'s control, including your device, GPS availability, wireless signals, operating system behavior, and environmental conditions. While we work to provide accurate location services, we cannot guarantee perfect accuracy at all times.',
    ],
  },
  {
    heading: 'Connections and messaging',
    body: [
      'HereNow is designed to help people connect through shared real-world experiences. Features such as messaging, We Met, My Circle, venue communities, organizations, creators, and future social features may evolve over time.',
      'We do not guarantee that you will meet people, receive responses, build relationships, or achieve any particular social or business outcome through the platform.',
    ],
  },
  {
    heading: 'Your content',
    body: [
      'You retain ownership of the content you submit to HereNow, including photos, profile information, messages, comments, and other user-generated content.',
      'By submitting content, you grant HereNow a worldwide, non-exclusive, royalty-free license to host, store, reproduce, display, distribute, and process that content solely for the purpose of operating, maintaining, improving, and promoting the HereNow service.',
      'You represent that you have the necessary rights to share any content you submit. We may remove content that violates these Terms, our Community Guidelines, or applicable law.',
    ],
  },
  {
    heading: 'Intellectual property',
    body: [
      'HereNow, including its software, trademarks, logos, graphics, designs, branding, text, and other platform content (excluding user-generated content), is owned by HereNow or its licensors and is protected by applicable intellectual property laws.',
      'You may not copy, modify, distribute, reverse engineer, sell, license, or otherwise exploit any part of HereNow except as permitted by law or with our prior written permission.',
    ],
  },
  {
    heading: 'Your safety',
    body: [
      'HereNow is intended to help people discover shared experiences and connect in the real world. While we strive to provide a safe platform, we do not perform background checks on users, guarantee the identity of users, or guarantee the accuracy of information provided by users, venues, organizations, or creators.',
      'You are responsible for your interactions with other people. Always exercise good judgment, meet in public places when appropriate, and prioritize your personal safety.',
      'If you believe another user has violated these Terms or poses a safety concern, please report them through the app or contact us.',
    ],
  },
  {
    heading: 'Venues, organizations, and creators',
    body: [
      'Venues, organizations, and creators are responsible for the information, events, promotions, and content they publish.',
      'HereNow does not endorse, guarantee, or assume responsibility for any venue, organization, creator, event, promotion, or offer available through the platform.',
    ],
  },
  {
    heading: 'Service availability',
    body: [
      'HereNow is provided on an "as is" and "as available" basis. While we work hard to provide a reliable service, we do not guarantee uninterrupted availability, error-free operation, or compatibility with every device or network.',
      'We may modify, suspend, discontinue, or remove features at any time without prior notice.',
    ],
  },
  {
    heading: 'Limitation of liability',
    body: [
      'To the fullest extent permitted by applicable law, HereNow and its owners, officers, employees, contractors, affiliates, licensors, and partners will not be liable for any indirect, incidental, consequential, special, exemplary, or punitive damages arising from or relating to your use of the platform.',
      'Nothing in these Terms limits liability where such limitations are prohibited by law.',
    ],
  },
  {
    heading: 'Ending your use',
    body: [
      'You may stop using HereNow and delete your account at any time.',
      'We may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, threaten the safety of others, interfere with the operation of the platform, or otherwise misuse HereNow.',
      'Certain provisions of these Terms, including those relating to intellectual property, limitation of liability, and any rights or obligations that by their nature should survive termination, will remain in effect after your account is terminated.',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'We may update these Terms from time to time as HereNow evolves. If we make material changes, we will update the Effective Date above and, when appropriate, notify users through the app or by other reasonable means.',
      'Your continued use of HereNow after those changes become effective constitutes acceptance of the revised Terms.',
    ],
  },
  {
    heading: 'Governing law',
    body: [
      'These Terms are governed by the laws of the State of Tennessee, without regard to its conflict of law principles.',
    ],
  },
  {
    heading: 'Privacy',
    body: [
      'Your use of HereNow is also governed by our Privacy Policy, which explains how we collect, use, and protect your information.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'If you have questions about these Terms, email us at support@herenowsocial.com.',
    ],
  },
]

export default function TermsScreen() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="July 28, 2026"
      intro="HereNow is a platform designed to help people discover and share real-world experiences through participating venues and communities. These Terms govern your use of the HereNow app, website, and related services. By creating an account or using HereNow, you agree to these Terms and our Privacy Policy. If you do not agree, please do not use HereNow."
      sections={SECTIONS}
    />
  )
}
