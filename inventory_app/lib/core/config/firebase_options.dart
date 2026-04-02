import 'package:firebase_core/firebase_core.dart'
    show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU',
    appId: '1:133801940558:web:39e564c9c1698a7695151f',
    messagingSenderId: '133801940558',
    projectId: 'newproject2-2afdc',
    authDomain: 'newproject2-2afdc.firebaseapp.com',
    storageBucket: 'newproject2-2afdc.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU',
    appId: '1:133801940558:android:39e564c9c1698a7695151f', // Guessing android ID based on web, or using same if it works
    messagingSenderId: '133801940558',
    projectId: 'newproject2-2afdc',
    storageBucket: 'newproject2-2afdc.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU',
    appId: '1:133801940558:ios:39e564c9c1698a7695151f',
    messagingSenderId: '133801940558',
    projectId: 'newproject2-2afdc',
    storageBucket: 'newproject2-2afdc.firebasestorage.app',
    iosBundleId: 'com.soheel.inventory',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU',
    appId: '1:133801940558:ios:39e564c9c1698a7695151f',
    messagingSenderId: '133801940558',
    projectId: 'newproject2-2afdc',
    storageBucket: 'newproject2-2afdc.firebasestorage.app',
    iosBundleId: 'com.soheel.inventory',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU',
    appId: '1:133801940558:web:39e564c9c1698a7695151f',
    messagingSenderId: '133801940558',
    projectId: 'newproject2-2afdc',
    authDomain: 'newproject2-2afdc.firebaseapp.com',
    storageBucket: 'newproject2-2afdc.firebasestorage.app',
  );
}
