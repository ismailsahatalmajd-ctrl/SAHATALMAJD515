import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: "AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU",
        appId: "1:133801940558:web:39e564c9c1698a7695151f", 
        messagingSenderId: "133801940558",
        projectId: "newproject2-2afdc",
        authDomain: "newproject2-2afdc.firebaseapp.com",
        storageBucket: "newproject2-2afdc.firebasestorage.app",
      ),
    );
    print("✅ Firebase Initialized Successfully");
  } catch (e) {
    print("❌ Firebase Initialization Error: $e");
  }

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Sahat Al Majd',
      locale: const Locale('ar'),
      builder: (context, child) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: child!,
        );
      },
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
        fontFamily: 'Segoe UI', // Good default for Windows
      ),
      home: const AuthWrapper(),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        
        if (snapshot.hasData) {
          return const AuthorizedHome();
        }
        
        return const LoginScreen();
      },
    );
  }
}

class AuthorizedHome extends StatelessWidget {
  final bool isLocal;
  final String? username;

  const AuthorizedHome({super.key, this.isLocal = false, this.username});

  Future<void> _signOut(BuildContext context) async {
    if (isLocal) {
        // For local mock, just go back to login
        Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
    } else {
        await FirebaseAuth.instance.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final userEmail = isLocal ? username : FirebaseAuth.instance.currentUser?.email;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('لوحة التحكم'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => _signOut(context),
            tooltip: 'تسجيل الخروج',
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.verified_user, size: 64, color: Colors.green),
            const SizedBox(height: 16),
            Text(
              'أهلاً بك، $userEmail',
              style: const TextStyle(fontSize: 18),
            ),
             const SizedBox(height: 8),
            const Text(
              'أنت الآن متصل بالنظام',
              style: TextStyle(color: Colors.grey),
            ),
            if (isLocal)
               const Padding(
                 padding: EdgeInsets.only(top: 8.0),
                 child: Chip(label: Text('وضع محلي (Demo)')),
               )
          ],
        ),
      ),
    );
  }
}
