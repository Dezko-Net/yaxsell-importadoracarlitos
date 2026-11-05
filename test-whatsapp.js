const fs = require('fs');
const path = require('path');

function loadEnv(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      });
    }
  } catch (e) {
    // Ignore errors reading files
  }
}

loadEnv('.env.local');
loadEnv('.env');

const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function testTemplate() {
  const number = process.argv[2];
  if (!number) {
    console.log("⚠️ Falta el número. Ejecútalo así: node test-whatsapp.js 56912345678");
    return;
  }

  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log("❌ Error: Faltan las variables WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en tu archivo .env");
    return;
  }

  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: number,
    type: "template",
    template: {
      name: "estado_de_pedido",
      language: {
        code: "es_CL" // Código para Spanish (CHL)
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Cliente Prueba" }, // Variable {{1}}
            { type: "text", text: "#TEST-001" },      // Variable {{2}}
            { type: "text", text: "En Camino 🚚" }    // Variable {{3}}
          ]
        }
      ]
    }
  };

  console.log(`Enviando plantilla a ${number}...`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (res.ok) {
      console.log("✅ ¡Mensaje enviado exitosamente!");
      console.log(data);
    } else {
      console.log("❌ Hubo un error al enviar:");
      console.log(data);
    }
  } catch (err) {
    console.error("Error de red al intentar contactar a Meta:", err);
  }
}

testTemplate();
