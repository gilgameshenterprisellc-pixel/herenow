import LegalDoc, { type LegalSection } from '@/components/LegalDoc'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Respect comes first',
    body: [
      'Treat people the way you would if you were standing next to them, because on HereNow, you often are.',
      'Be kind. Be welcoming. Be respectful.',
      'Disagreements happen, but harassment, intimidation, bullying, or hateful behavior have no place here.',
    ],
  },
  {
    heading: 'Be yourself',
    body: [
      'Use your real identity and represent yourself honestly. Don\'t impersonate other people, businesses, organizations, or creators. Don\'t create fake accounts or mislead others about who you are.',
      'Authentic people create authentic communities.',
    ],
  },
  {
    heading: 'Respect people\'s privacy',
    body: [
      'HereNow is designed to help people discover shared experiences, not to track individuals. Never attempt to:',
      { bullets: [
        'Reveal someone\'s private information.',
        'Follow or monitor someone against their wishes.',
        'Use HereNow to intimidate or harass others.',
        'Circumvent another user\'s privacy settings.',
        'Share another person\'s personal information without permission.',
      ] },
      'Respect that every user decides how visible they want to be.',
    ],
  },
  {
    heading: 'Respect the places you visit',
    body: [
      'Participating venues trust HereNow to help build stronger communities. When you\'re checked into a venue:',
      { bullets: [
        'Follow the venue\'s rules.',
        'Respect employees and guests.',
        'Don\'t interfere with normal business operations.',
        'Don\'t misuse venue features.',
      ] },
      'HereNow should improve the experience for everyone, not disrupt it.',
    ],
  },
  {
    heading: 'Check in honestly',
    body: [
      'Only check into places where you are actually present. Do not:',
      { bullets: [
        'Falsify your location.',
        'Attempt to bypass geofencing.',
        'Manipulate location services.',
        'Use GPS spoofing or similar tools.',
      ] },
      'These actions undermine the integrity of the platform and may result in account suspension.',
    ],
  },
  {
    heading: 'Keep content appropriate',
    body: [
      'Share content that contributes positively to the community. Do not post content that includes:',
      { bullets: [
        'Harassment or threats',
        'Hate speech',
        'Graphic violence',
        'Sexual exploitation',
        'Illegal activity',
        'Spam',
        'Fraud',
        'Misleading information intended to deceive',
        'Malware or malicious links',
      ] },
      'We may remove content that violates these guidelines.',
    ],
  },
  {
    heading: 'Respect conversations',
    body: [
      'Whether you\'re chatting with someone one-on-one or participating in a venue community:',
      { bullets: [
        'Don\'t spam.',
        'Don\'t send unwanted advertisements.',
        'Respect when someone isn\'t interested in talking.',
        'Don\'t pressure people into sharing personal information.',
      ] },
      'Meaningful conversations happen when everyone feels comfortable participating.',
    ],
  },
  {
    heading: 'Protect the community',
    body: [
      'If you see behavior that makes you or someone else feel unsafe, report it. Reports help us:',
      { bullets: [
        'Investigate abuse.',
        'Remove harmful content.',
        'Suspend bad actors.',
        'Improve the HereNow community.',
      ] },
      'We review reports carefully and may take action when these Guidelines or our Terms of Service are violated.',
    ],
  },
  {
    heading: 'Venues, organizations, and creators',
    body: [
      'If you represent a venue, organization, or creator account:',
      { bullets: [
        'Represent yourself honestly.',
        'Keep your information accurate.',
        'Honor promotions and events you advertise.',
        'Respect your audience.',
        'Avoid misleading or deceptive practices.',
      ] },
      'You\'re helping represent both your brand and the HereNow community.',
    ],
  },
  {
    heading: 'Safety matters',
    body: [
      'Meeting new people can be rewarding, but always use good judgment. We encourage users to:',
      { bullets: [
        'Meet in public places.',
        'Trust your instincts.',
        'Respect personal boundaries.',
        'Leave situations that make you uncomfortable.',
        'Contact local authorities if you believe someone is in immediate danger.',
      ] },
      'HereNow cannot guarantee the behavior or identity of other users.',
    ],
  },
  {
    heading: 'Enforcement',
    body: [
      'If you violate these Community Guidelines or our Terms of Service, we may take action, including:',
      { bullets: [
        'Removing content.',
        'Restricting certain features.',
        'Issuing warnings.',
        'Suspending your account.',
        'Permanently removing your account.',
      ] },
      'The action we take depends on the severity and frequency of the violation.',
    ],
  },
  {
    heading: 'Our goal',
    body: [
      'HereNow isn\'t just another social platform. It\'s a community built around real places, real experiences, and real people. Every respectful interaction helps make the platform better for everyone.',
      'Thank you for being part of HereNow. Questions? Email us at support@herenowsocial.com.',
    ],
  },
]

export default function CommunityGuidelinesScreen() {
  return (
    <LegalDoc
      title="Community Guidelines"
      updated="July 28, 2026"
      intro="HereNow exists to help people connect through shared real-world experiences. Whether you're grabbing coffee, attending a concert, cheering for your team, or exploring a new neighborhood, our goal is to make being out in the world a little more social. Every person helps shape this community. These guidelines explain what we expect from everyone who uses HereNow."
      sections={SECTIONS}
    />
  )
}
