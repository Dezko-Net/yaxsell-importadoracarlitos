import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as updateFirebaseProfile,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth, authReady } from '@/lib/firebase';
import { listDocuments, createDocument, updateDocument, USERS_COLLECTION_ID, Query, ID } from '@/lib/db';
import { upsertUserProfile } from '@/lib/users-db';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  photoURL?: string;
  birthDate?: string;
  isWholesale?: boolean;
  createdAt: string;
  updatedAt: string;
}

export class AuthService {
  private static _readCachedUser(): User | null {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem('yaxsel_auth_user');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return parsed && parsed.id && parsed.email ? parsed : null;
    } catch {
      return null;
    }
  }

  static async clearAllSessions(): Promise<void> {
    try {
      await signOut(auth);
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('yaxsel_auth_user');
      localStorage.removeItem('yaxsel_auth_time');
    }
  }

  static async login(email: string, password: string) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = cred.user;

      const user: User = {
        id: fbUser.uid,
        email: fbUser.email || email,
        name: fbUser.displayName || 'Usuario',
        phone: (fbUser as any).phoneNumber || undefined,
        photoURL: fbUser.photoURL || undefined,
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await upsertUserProfile({
          userId: fbUser.uid,
          email: fbUser.email || email,
          name: fbUser.displayName || 'Usuario',
          phone: '',
        });
      } catch (dbError) {
        console.log('No se pudo sincronizar perfil en users:', dbError);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('yaxsel_auth_user', JSON.stringify(user));
        localStorage.setItem('yaxsel_auth_time', Date.now().toString());
      }

      return { success: true, user };
    } catch (error: any) {
      console.error('Login error:', error);
      const msg = error?.message || 'Error al iniciar sesión';
      let friendly = msg;
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        friendly = 'Correo o contraseña incorrectos';
      } else if (msg.includes('auth/user-not-found')) {
        friendly = 'No existe una cuenta con este correo';
      } else if (msg.includes('auth/too-many-requests')) {
        friendly = 'Demasiados intentos. Intenta más tarde';
      } else if (msg.includes('auth/invalid-email')) {
        friendly = 'Correo electrónico inválido';
      }
      return { success: false, error: friendly };
    }
  }

  static async register(email: string, password: string, name: string, phone?: string, rut?: string, birthDate?: string) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = cred.user;

      if (name) {
        try {
          await updateFirebaseProfile(fbUser, { displayName: name });
        } catch {}
      }

      const userObj: User = {
        id: fbUser.uid,
        email: fbUser.email || email,
        name: name,
        phone: phone,
        photoURL: fbUser.photoURL || undefined,
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await upsertUserProfile({
          userId: fbUser.uid,
          email: fbUser.email || email,
          name: name,
          phone: phone || '',
        });
      } catch (dbError) {
        console.log('No se pudo sincronizar perfil en users:', dbError);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('yaxsel_auth_user', JSON.stringify(userObj));
        localStorage.setItem('yaxsel_auth_time', Date.now().toString());
      }

      return { success: true, user: userObj };
    } catch (error: any) {
      console.error('Register error:', error);
      const msg = error?.message || '';
      let friendly = msg;
      if (msg.includes('auth/email-already-in-use') || msg.includes('already exists')) {
        friendly = 'Ya existe una cuenta con este correo electrónico. Intenta iniciar sesión.';
      } else if (msg.includes('auth/weak-password')) {
        friendly = 'La contraseña debe tener al menos 6 caracteres';
      } else if (msg.includes('auth/invalid-email')) {
        friendly = 'Correo electrónico inválido';
      }
      return { success: false, error: friendly };
    }
  }

  static async loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const fbUser = cred.user;
      const isNew = getAdditionalUserInfo(cred)?.isNewUser;

      const user: User = {
        id: fbUser.uid,
        email: fbUser.email || '',
        name: fbUser.displayName || 'Usuario',
        phone: (fbUser as any).phoneNumber || undefined,
        photoURL: fbUser.photoURL || undefined,
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await upsertUserProfile({
          userId: fbUser.uid,
          email: fbUser.email || '',
          name: fbUser.displayName || 'Usuario',
          phone: (fbUser as any).phoneNumber || '',
        });
      } catch (dbError) {
        console.log('No se pudo sincronizar perfil en users:', dbError);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('yaxsel_auth_user', JSON.stringify(user));
        localStorage.setItem('yaxsel_auth_time', Date.now().toString());
      }

      return { success: true, user, isNewUser: isNew };
    } catch (error: any) {
      console.error('Google login error:', error);
      const msg = error?.message || 'Error al iniciar sesión con Google';
      let friendly = msg;
      if (msg.includes('auth/popup-closed-by-user')) {
        friendly = 'Cerraste la ventana de Google. Intenta de nuevo.';
      } else if (msg.includes('auth/cancelled-popup-request')) {
        friendly = 'Se canceló el inicio de sesión con Google';
      } else if (msg.includes('auth/popup-blocked')) {
        friendly = 'El navegador bloqueó la ventana emergente. Permite popups para este sitio.';
      } else if (msg.includes('auth/unauthorized-domain') || msg.includes('unauthorized-domain')) {
        friendly = 'Este dominio no está autorizado en Firebase. Contacta al administrador para agregarlo en Firebase Console → Authentication → Settings → Authorized domains.';
      }
      return { success: false, error: friendly };
    }
  }

  static async logout() {
    try {
      await signOut(auth);
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('yaxsel_auth_user');
      localStorage.removeItem('yaxsel_auth_time');
    }
    return { success: true };
  }

  private static async _fetchAndCacheUser(): Promise<User | null> {
    try {
      // Esperar siempre a que Firebase Auth termine de hidratar desde IndexedDB
      await authReady;
      const fbUser = auth.currentUser;
      if (!fbUser) {
        return null;
      }

      const cached = this._readCachedUser();
      const cachedUser = cached?.id === fbUser.uid ? cached : null;
      let isWholesale: boolean = Boolean(cachedUser?.isWholesale);
      try {
        const userDoc = await listDocuments(USERS_COLLECTION_ID, [Query.equal('userId', fbUser.uid)]);
        if (userDoc.documents.length > 0) {
          isWholesale = Boolean(userDoc.documents[0].isWholesale);
        }
      } catch (dbError) {
        console.log('Error fetching user from database:', dbError);
      }

      const user: User = {
        id: fbUser.uid,
        email: fbUser.email || cachedUser?.email || '',
        name: fbUser.displayName || cachedUser?.name || 'Usuario',
        phone: (fbUser as any).phoneNumber || cachedUser?.phone || undefined,
        photoURL: fbUser.photoURL || cachedUser?.photoURL || undefined,
        isWholesale,
        createdAt: fbUser.metadata.creationTime || cachedUser?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('yaxsel_auth_user', JSON.stringify(user));
        localStorage.setItem('yaxsel_auth_time', Date.now().toString());
      }
      return user;
    } catch {
      return null;
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    return await this._fetchAndCacheUser();
  }

  static async isLoggedIn(): Promise<boolean> {
    await authReady;
    return !!auth.currentUser;
  }

  static async updateProfile(updates: Partial<User>) {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser) {
        return { success: false, error: 'No hay sesión activa' };
      }

      if (updates.name) {
        try {
          await updateFirebaseProfile(fbUser, { displayName: updates.name });
        } catch {}
      }

      try {
        const userDoc = await listDocuments(USERS_COLLECTION_ID, [Query.equal('userId', fbUser.uid)]);
        if (userDoc.documents.length > 0) {
          const docId = userDoc.documents[0].$id;
          await updateDocument(USERS_COLLECTION_ID, docId, {
            name: updates.name,
            phone: updates.phone || '',
          });
        }
      } catch (dbError) {
        console.log('Error updating user document:', dbError);
      }

      const user: User = {
        id: fbUser.uid,
        email: fbUser.email || '',
        name: updates.name || fbUser.displayName || 'Usuario',
        phone: updates.phone,
        photoURL: updates.photoURL || fbUser.photoURL || undefined,
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('yaxsel_auth_user', JSON.stringify(user));
      }

      return { success: true, user };
    } catch (error: any) {
      console.error('Update profile error:', error);
      return { success: false, error: error.message || 'Error al actualizar perfil' };
    }
  }

  static onAuthChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const user: User = {
          id: fbUser.uid,
          email: fbUser.email || '',
          name: fbUser.displayName || 'Usuario',
          photoURL: fbUser.photoURL || undefined,
          createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        callback(user);
      } else {
        callback(null);
      }
    });
  }
}
