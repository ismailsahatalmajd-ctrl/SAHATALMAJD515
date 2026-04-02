"use client"

import { useEffect } from 'react'

export default function PWASetup() {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error);
        });
    }

    // Install prompt handler
    let deferredPrompt: any = null;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      
      // Show custom install button or UI
      const installButton = document.createElement('button');
      installButton.innerHTML = '📱 تثبيت التطبيق';
      installButton.className = 'fixed bottom-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 hover:bg-indigo-700 transition-colors';
      installButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4f46e5;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        border: none;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        cursor: pointer;
        font-weight: 500;
        z-index: 9999;
        transition: all 0.3s ease;
      `;

      installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`User response to the install prompt: ${outcome}`);
          deferredPrompt = null;
          installButton.remove();
        }
      });

      document.body.appendChild(installButton);

      // Auto-hide after 10 seconds
      setTimeout(() => {
        if (installButton.parentNode) {
          installButton.style.opacity = '0';
          setTimeout(() => installButton.remove(), 300);
        }
      }, 10000);
    };

    const handleAppInstalled = () => {
      console.log('PWA was installed');
      // Hide install button if visible
      const installButton = document.querySelector('button[innerHTML*="تثبيت التطبيق"]');
      if (installButton) {
        installButton.remove();
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Cleanup
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return null;
}
