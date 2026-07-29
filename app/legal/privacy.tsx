import LegalDoc, { type LegalSection } from '@/components/LegalDoc'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Account information',
    body: [
      'When you create an account, we may collect information such as:',
      { bullets: [
        'First and last name',
        'Username',
        'Email address or phone number',
        'Date of birth',
        'Profile photo (if you choose to upload one)',
        'Bio',
        'Interests',
        'Social links (if applicable)',
        'Any additional information you voluntarily provide',
      ] },
      'You control what information appears on your profile through your privacy settings.',
    ],
  },
  {
    heading: 'Location information',
    body: [
      'HereNow is built around places, so location services are an essential part of the platform. With your permission, we collect your device\'s location to:',
      { bullets: [
        'Verify that you are physically present before allowing check-in to a venue',
        'Maintain an accurate check-in while you remain at a venue',
        'Detect when you leave a venue so your check-in can automatically end',
        'Display participating venues near you',
        'Prevent fraudulent or abusive check-ins',
        'Improve the accuracy and reliability of location-based features',
      ] },
      'Some of these features may require background location access if you choose to enable automatic check-out. You may disable location permissions at any time through your device settings. Doing so may prevent certain features from functioning properly.',
    ],
  },
  {
    heading: 'Location privacy',
    body: [
      'Your privacy is one of the core principles behind HereNow. Although HereNow uses your location to verify venue attendance, HereNow never displays your precise location within a venue to other users.',
      'Other users may only see that you are currently checked into the same venue, subject to your privacy settings. If you enable Ghost Mode, your profile will not appear to other users while your anonymous activity may still contribute to aggregated venue analytics.',
      'HereNow does not continuously track your location beyond what is reasonably necessary to provide our location-based services.',
    ],
  },
  {
    heading: 'Activity information',
    body: [
      'We may collect information about how you use HereNow, including:',
      { bullets: [
        'Venue check-ins and check-outs',
        'Venues visited',
        'Events attended',
        'Social Mode and Mood selections',
        '"We Met" connections',
        'Messages sent through the platform',
        'Photos or other content you upload',
        'Reports submitted',
        'User interactions',
        'Feature usage',
      ] },
    ],
  },
  {
    heading: 'Device information',
    body: [
      'We may automatically collect technical information including device model, operating system, app version, IP address, device identifiers, push notification token, crash reports, diagnostic information, and performance analytics. This information helps us improve security, stability, and reliability.',
    ],
  },
  {
    heading: 'How we use your information',
    body: [
      'We use your information to:',
      { bullets: [
        'Provide and operate HereNow',
        'Verify venue attendance',
        'Enable check-ins and automatic check-outs',
        'Display participating venues near you',
        'Facilitate interactions between users',
        'Display your profile according to your privacy settings',
        'Provide customer support',
        'Send notifications you choose to receive',
        'Improve the app and develop new features',
        'Detect fraud and unauthorized activity',
        'Maintain the safety and integrity of the platform',
        'Comply with legal obligations',
      ] },
    ],
  },
  {
    heading: 'How we share information: with other users',
    body: [
      'If your profile is visible, other users currently checked into the same venue may see information from your profile according to your privacy settings. This may include your name, profile photo, bio, interests, Social Mode, Mood, mutual connections, and other profile information you choose to make visible.',
      'HereNow never displays your precise location within a venue. If Ghost Mode is enabled, your profile will not appear to other users.',
    ],
  },
  {
    heading: 'How we share information: with participating venues',
    body: [
      'Participating venues receive aggregated, anonymized analytics about activity occurring at their location. These analytics may include number of visitors, peak activity periods, returning visitor trends, general age ranges, general gender distribution (where available), and engagement statistics.',
      'Venues do not receive access to individual user accounts, personal messages, or identifiable user profiles through these analytics.',
    ],
  },
  {
    heading: 'How we share information: with service providers',
    body: [
      'We work with trusted third-party providers that help operate HereNow. Each may process personal information only as necessary to perform its service on our behalf, and each is contractually obligated to safeguard your information.',
      'The providers we currently rely on include:',
      { bullets: [
        'Supabase — cloud database, authentication, file storage, and account-related email',
        'Vercel — web hosting and performance monitoring',
        'Expo — application delivery and push notification routing',
        'Apple and Google — device location services and in-app maps',
        'Sentry — crash and error reporting',
      ] },
    ],
  },
  {
    heading: 'How we share information: legal requirements',
    body: [
      'We may disclose information when we believe disclosure is necessary to comply with applicable law, respond to lawful legal requests, protect the rights or safety of HereNow or others, investigate fraud or misuse, or enforce our Terms of Service.',
    ],
  },
  {
    heading: 'Business transfers',
    body: [
      'If HereNow is involved in a merger, acquisition, financing, restructuring, or sale of assets, your information may be transferred as part of that transaction.',
    ],
  },
  {
    heading: 'We do not sell your personal information',
    body: [
      'HereNow does not sell your personal information. We also do not permit participating venues to purchase access to identifiable user information through our analytics platform.',
    ],
  },
  {
    heading: 'Photos and user content',
    body: [
      'Content you voluntarily submit, including photos, messages, comments, and other user-generated content, may be visible to other users depending on where it is shared within HereNow.',
      'Some features are designed to be temporary or ephemeral. While HereNow may remove this content after its intended display period, we cannot guarantee that other users have not retained or captured content before it expires.',
    ],
  },
  {
    heading: 'Your privacy choices',
    body: [
      'You control many aspects of your HereNow experience. You may:',
      { bullets: [
        'Choose your profile visibility',
        'Enable or disable Ghost Mode',
        'Manage notification preferences',
        'Edit your profile information',
        'Update account information',
        'Delete your account',
        'Disable location permissions through your device settings',
      ] },
      'Disabling certain permissions may limit some features of the app.',
    ],
  },
  {
    heading: 'Data retention',
    body: [
      'We retain personal information only for as long as reasonably necessary to provide our services and fulfill the purposes described in this Privacy Policy. Venue check-ins are temporary and end when your visit concludes.',
      'Some information may be retained where necessary to comply with legal obligations, resolve disputes, prevent fraud, enforce our Terms of Service, or protect the safety and integrity of the platform.',
    ],
  },
  {
    heading: 'Account deletion',
    body: [
      'You may delete your account at any time through the app or by contacting us at support@herenowsocial.com.',
      'Following your deletion request, we will begin deleting or anonymizing your personal information except where retention is required by law or reasonably necessary for fraud prevention, dispute resolution, security, or other legitimate business purposes.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'We use commercially reasonable administrative, technical, and organizational safeguards to protect your information, including encryption of data in transit, access controls, secure authentication, protected cloud infrastructure, and ongoing security monitoring.',
      'While we work hard to protect your information, no method of electronic transmission or storage can be guaranteed to be completely secure.',
    ],
  },
  {
    heading: 'Your privacy rights',
    body: [
      'Depending on where you live, you may have certain rights regarding your personal information under applicable law. These rights may include the ability to access your personal information, correct inaccurate information, delete your personal information, receive a copy of your personal information, and appeal certain privacy-related decisions where applicable.',
      'To exercise these rights, please contact us at support@herenowsocial.com.',
    ],
  },
  {
    heading: 'Children\'s privacy',
    body: [
      'HereNow is intended only for individuals who are 18 years of age or older. We do not knowingly collect personal information from anyone under the age of 18. If we learn that we have collected personal information from someone under 18, we will promptly delete that information.',
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'We may update this Privacy Policy from time to time as HereNow evolves. If we make material changes, we will update the Effective Date above and, when appropriate, notify users through the app or other reasonable means.',
      'Your continued use of HereNow after changes become effective constitutes acceptance of the updated Privacy Policy.',
    ],
  },
  {
    heading: 'Contact us',
    body: [
      'If you have any questions about this Privacy Policy or our privacy practices, email us at support@herenowsocial.com.',
    ],
  },
]

export default function PrivacyPolicyScreen() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="July 28, 2026"
      intro="At HereNow, privacy is fundamental to how our platform is designed. We built HereNow to help people connect through shared real-world experiences, not to track people or expose their precise location. This policy explains what information we collect, how we use it, when it may be shared, and the choices you have. By creating an account or using HereNow, you agree to the practices described here."
      sections={SECTIONS}
    />
  )
}
