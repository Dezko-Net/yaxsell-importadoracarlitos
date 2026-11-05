import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCEcbWJSiDKXnAanhVb_hQ79fLbqeXpYYs",
  authDomain: "asistoraerp.firebaseapp.com",
  projectId: "asistoraerp",
  storageBucket: "asistoraerp.firebasestorage.app",
  messagingSenderId: "386824737987",
  appId: "1:386824737987:web:f85ebb6bae11190da3be76",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function createUsers() {
  // Create dezkonet@gmail.com
  try {
    const cred = await createUserWithEmailAndPassword(auth, 'dezkonet@gmail.com', 'redes123');
    console.log('Usuario dezkonet creado:', cred.user.uid);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('dezkonet ya existe, verificando login...');
      try {
        const cred = await signInWithEmailAndPassword(auth, 'dezkonet@gmail.com', 'redes123');
        console.log('Login dezkonet OK:', cred.user.uid);
      } catch (loginErr) {
        console.log('Login dezkonet falló (password distinta):', loginErr.message);
      }
    } else {
      console.error('Error creando dezkonet:', err.message);
    }
  }

  // Create yanpolreyes666@gmail.com
  try {
    const cred = await createUserWithEmailAndPassword(auth, 'yanpolreyes666@gmail.com', 'redes123');
    console.log('Usuario yanpol creado:', cred.user.uid);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('yanpol ya existe, verificando login...');
      try {
        const cred = await signInWithEmailAndPassword(auth, 'yanpolreyes666@gmail.com', 'redes123');
        console.log('Login yanpol OK:', cred.user.uid);
      } catch (loginErr) {
        console.log('Login yanpol falló (password distinta):', loginErr.message);
      }
    } else {
      console.error('Error creando yanpol:', err.message);
    }
  }

  process.exit(0);
}

createUsers();
