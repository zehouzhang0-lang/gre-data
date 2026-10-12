import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// The screen handles sheets/selection before asking Android to leave the app.
export async function listenToAndroidBack(handler) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const listener = await App.addListener('backButton', () => handler());
  return () => listener.remove();
}

export async function exitAndroidApp() {
  if (Capacitor.isNativePlatform()) await App.exitApp();
}

export const isAndroidApp = () => Capacitor.getPlatform() === 'android';
