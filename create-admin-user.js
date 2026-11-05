const admin = require('firebase-admin');

// Parse credentials from .env.local
const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const match = envContent.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.*)/);
const creds = JSON.parse(match[1]);

admin.initializeApp({
  credential: admin.credential.cert(creds),
  projectId: 'asistoraerp',
});

async function createAdmin() {
  const email = 'dezkonet@gmail.com';
  const password = 'redes123';
  
  try {
    // Try to create the user
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: 'Administrador',
    });
    console.log('Usuario creado:', user.uid, user.email);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      // Update password instead
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(user.uid, { password });
      console.log('Usuario actualizado (ya existía):', user.uid, user.email);
    } else {
      throw err;
    }
  }
  
  // Also create yanpol user
  try {
    const user2 = await admin.auth().createUser({
      email: 'yanpolreyes666@gmail.com',
      password: 'redes123',
      displayName: 'Yanpol Reyes',
    });
    console.log('Usuario yanpol creado:', user2.uid, user2.email);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const user2 = await admin.auth().getUserByEmail('yanpolreyes666@gmail.com');
      await admin.auth().updateUser(user2.uid, { password });
      console.log('Usuario yanpol actualizado:', user2.uid, user2.email);
    } else {
      console.error('Error con yanpol:', err.message);
    }
  }
  
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
