import 'package:http/http.dart' as http;

class TestApi {
  static Future<void> testConnection() async {
    try {
      print('Testing connection to https://sahatalmajd.com...');
      
      // اختبار الاتصال بالموقع الرئيسي
      final mainResponse = await http.get(
        Uri.parse('https://sahatalmajd.com'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );
      
      print('Main site status: ${mainResponse.statusCode}');
      print('Main site response length: ${mainResponse.body.length}');
      
      // اختبار الاتصال بـ API
      final apiResponse = await http.get(
        Uri.parse('https://sahatalmajd.com/api/disbursements'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );
      
      print('API status: ${apiResponse.statusCode}');
      print('API response: ${apiResponse.body}');
      
    } catch (e) {
      print('Connection error: $e');
    }
  }
}
