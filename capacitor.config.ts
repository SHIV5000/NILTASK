import type { CapacitorConfig } from '@capacitor/cli';

// Remote-URL model: the native app is a thin shell that loads the LIVE Vercel
// site. No web code is frozen into the app — a push to `main` updates the app's
// content instantly, exactly like the PWA. The web app + PWA install button keep
// working unchanged; this file only affects the native Android/iOS builds.
const config: CapacitorConfig = {
  appId: 'in.niltask.app',
  appName: 'Noted For Action',
  webDir: 'www',                       // placeholder only; real code comes from server.url
  server: {
    url: 'https://niltask.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#312e81',       // brand indigo — matches the boot splash
      showSpinner: false,
    },
  },
};

export default config;
