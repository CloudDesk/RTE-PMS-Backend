import { getToken, onMessage } from "firebase/messaging";
import { initializeMessaging, getMessagingInstance } from "./firebaseConfig";

export const getFCMToken = async () => {
  let messaging = getMessagingInstance();

  // If messaging is not initialized, try to initialize it
  if (!messaging) {
    console.log("Messaging not initialized, attempting to initialize...");
    messaging = await initializeMessaging();
  }

  if (!messaging) {
    console.log("FCM not supported on this browser");
    return null;
  }

  try {
    // Request notification permission
    console.log("Requesting notification permission...");
    const permission = await Notification.requestPermission();
    console.log("Permission result:", permission);
    
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    // Register service worker
    console.log("Registering service worker...");
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log("Service worker registered successfully:", swReg);
    } catch (swError) {
      console.error("Service worker registration failed:", swError);
      // Try alternative path
      try {
        swReg = await navigator.serviceWorker.register('/static/firebase-messaging-sw.js');
        console.log("Service worker registered with alternative path:", swReg);
      } catch (swError2) {
        console.error("Alternative service worker registration also failed:", swError2);
        return null;
      }
    }

    // Get VAPID key
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error("VAPID key not found in environment variables");
      console.log("Please add VITE_FIREBASE_VAPID_KEY to your .env file");
      return null;
    }

    console.log("Getting FCM token...");
    // Retrieve FCM token
    const currentToken = await getToken(messaging, {
      vapidKey: vapidKey,
      serviceWorkerRegistration: swReg,
    });
    
    console.log("FCM token received:", currentToken ? `${currentToken.substring(0, 20)}...` : 'null');
    
    if (currentToken) {
      console.log("FCM token generated successfully");
      return currentToken;
    } else {
      console.log("No FCM registration token available. Request permission to generate one.");
      return null;
    }
  } catch (error) {
    console.error("FCM token error:", error);
    return null;
  }
};

export function onMessageListener(callback: (payload: any) => void) {
  const messaging = getMessagingInstance();

  if (!messaging) {
    console.log("FCM not supported, skipping message listener");
    return;
  }

  console.log("Setting up foreground message listener...");
  
  // Handle foreground messages
  onMessage(messaging, (payload) => {
    console.log("FCM Foreground Message received:", payload);
    console.log("Notification title:", payload.notification?.title);
    console.log("Notification body:", payload.notification?.body);
    console.log("Data payload:", payload.data);
    callback(payload);
  });
} 