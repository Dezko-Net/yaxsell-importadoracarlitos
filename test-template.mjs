// Test: send confirmar_stock_balatin template with URL button to Lissy
const TOKEN = 'EAAjQT0EIDHUBRxClDmZC8CkfCba7b8aeylKimDeUNADaqv5AyjZCfZAtoaX5ZCOmdjRQhoMnbQCiUuolG1YHlY6ZAW2EddKTlTbZCLhuF4MxZBy0DE4SNLfVa8pfXzsQgingT1gMDc7aWeJ5KS97ZALxfmiQzBUDOTPOGJBE5CigpDcbeN9ZBkZAdWrFAGFG1r2vntSQZDZD';
const PHONE_ID = '1301749033014628';
const TO = '56962293893';

async function send() {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: TO,
    type: 'template',
    template: {
      name: 'confirmar_stock_balatin',
      language: { code: 'es_CL' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'WA-LISSY003' },
            { type: 'text', text: 'Test Lissy' },
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [
            { type: 'text', text: 'WA-LISSY003' }
          ]
        }
      ],
    },
  };

  console.log('Sending confirmar_stock_balatin to Lissy', TO);
  const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

send().catch(e => console.error('Error:', e.message));
