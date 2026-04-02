import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../models/product.dart';

class ProductService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final CollectionReference _productsCollection = 
      FirebaseFirestore.instance.collection('products');

  Future<String?> uploadImage(String localPath, String fileName) async {
    try {
      File file = File(localPath);
      Reference ref = _storage.ref().child('product_images').child('$fileName.jpg');
      UploadTask uploadTask = ref.putFile(file);
      TaskSnapshot snapshot = await uploadTask;
      return await snapshot.ref.getDownloadURL();
    } catch (e) {
      print('Upload error: $e');
      return null;
    }
  }

  Stream<List<Product>> getProducts() {
    return _productsCollection
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Product.fromFirestore(doc))
            .toList());
  }

  Stream<List<Product>> getProductsByCategory(String category) {
    return _productsCollection
        .where('category', isEqualTo: category)
        .snapshots()
        .map((snapshot) {
      final products = snapshot.docs
          .map((doc) => Product.fromFirestore(doc))
          .toList();
      // فرز المنتجات برمجياً لتجنب الحاجة إلى إنشاء Index في Firebase
      products.sort((a, b) => a.productName.compareTo(b.productName));
      return products;
    });
  }

  Future<void> addProduct(Product product) async {
    await _productsCollection.add(product.toFirestore());
  }

  Future<void> updateProduct(String id, Product product) async {
    await _productsCollection.doc(id).update(product.toFirestore());
  }

  Future<void> deleteProduct(String id) async {
    await _productsCollection.doc(id).delete();
  }

  Future<List<String>> getCategories() async {
    QuerySnapshot snapshot = await _productsCollection.get();
    Set<String> categories = {};
    for (var doc in snapshot.docs) {
      String category = doc.get('category') ?? 'غير مصنف';
      categories.add(category);
    }
    return categories.toList();
  }

  Stream<List<Product>> searchProducts(String query) {
    if (query.isEmpty) {
      return Stream.value([]);
    }
    
    return _productsCollection
        .where('productName', isGreaterThanOrEqualTo: query)
        .where('productName', isLessThanOrEqualTo: query + '\uf8ff')
        .orderBy('productName')
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Product.fromFirestore(doc))
            .toList());
  }
}
