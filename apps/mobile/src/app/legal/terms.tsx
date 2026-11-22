import { LEGAL } from '@/trackmate/auth';
import { LegalDoc } from '@/ui/LegalDoc';

export default function Terms() {
  return (
    <LegalDoc
      title="Terms and Conditions"
      version={LEGAL.TERMS_OF_SERVICE}
      sections={[
        ['What TrackMate is', 'TrackMate helps you plan journeys, track your route and ask for help. It is not an emergency service. It cannot guarantee that a message is delivered or that anyone responds. In a life-threatening situation, also call your local emergency number (112 in India) if you can.'],
        ['How messages travel', 'An SOS or check-in is saved on your phone first and then sent over whatever route is available: the internet, a nearby TrackMate phone, or SMS that you choose to send. TrackMate shows how far each message actually got. Delivery depends on networks, devices and people outside our control.'],
        ['Your account', 'Keep your password private and your details accurate, especially your emergency contacts. You are responsible for activity on your account. You can delete your account at any time.'],
        ['Helping others', 'If you turn on "Help others", your phone passes other people’s messages on. Do not read, change or delay them. You can turn it off at any time.'],
        ['Acceptable use', 'Do not send false SOS messages, misuse other people’s data, or try to break or overload the service.'],
        ['Changes', 'We will tell you about important changes to these terms and ask you to accept new versions before they apply.'],
      ]}
    />
  );
}
