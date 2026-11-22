import { LEGAL } from '@/trackmate/auth';
import { LegalDoc } from '@/ui/LegalDoc';

export default function Privacy() {
  return (
    <LegalDoc
      title="Privacy Policy"
      version={LEGAL.PRIVACY_POLICY}
      sections={[
        ['What we collect for your account', 'Your name, phone number, email address, a securely hashed password (we never store the password itself) and the emergency contact you give us. We record which version of these documents you accepted and when.'],
        ['Location', 'Accepting this policy does not turn on location sharing. Your phone shares location only when you send an SOS, check in, or start tracking a journey, and only after Android asks you for permission. You can turn location off at any time.'],
        ['Health and fitness data', 'Accepting this policy does not give us access to health data. If a fitness feature is added later, it will ask for your separate permission and you can say no.'],
        ['Automatic alerts', 'TrackMate will never alert your contacts automatically unless you set that up yourself and agree to it separately.'],
        ['What stays on your phone', 'Journeys, routes, trusted contacts and the record of messages you sent are stored on your phone. Messages you send are kept by the safety station that receives them.'],
        ['Who sees your SOS', 'The safety station and responders that receive it, and phones that relay it on the way. Relaying phones pass messages on and do not display their contents beyond who needs help and what kind.'],
        ['Your choices', 'You can see and change your details, withdraw consent, and delete your account. Deleting your account removes your account data from our server.'],
        ['Law', 'We intend to follow India’s Digital Personal Data Protection Act, 2023 and its rules. This section will be completed after legal review.'],
      ]}
    />
  );
}
