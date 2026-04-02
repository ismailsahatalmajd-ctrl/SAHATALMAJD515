import 'package:cloud_firestore/cloud_firestore.dart';

class Product {
  final String? id;
  final String productCode;
  final String itemNumber;
  final String location;
  final String productName;
  final double quantity;
  final String unit;
  final double price;
  final String category;
  final String? image;
  final DateTime createdAt;
  final DateTime updatedAt;

  Product({
    this.id,
    required this.productCode,
    required this.itemNumber,
    required this.location,
    required this.productName,
    required this.quantity,
    required this.unit,
    required this.price,
    required this.category,
    this.image,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Product.fromFirestore(DocumentSnapshot doc) {
    Map data = doc.data() as Map<String, dynamic>;
    return Product(
      id: doc.id,
      productCode: data['productCode'] ?? '',
      itemNumber: data['itemNumber'] ?? '',
      location: data['location'] ?? '',
      productName: data['productName'] ?? '',
      quantity: _parseNum(data['quantity']),
      unit: data['unit'] ?? '',
      price: _parseNum(data['price']),
      category: data['category'] ?? '',
      image: data['image'],
      createdAt: _parseDate(data['createdAt']),
      updatedAt: _parseDate(data['updatedAt']),
    );
  }

  static double _parseNum(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0.0;
    return 0.0;
  }

  static DateTime _parseDate(dynamic date) {
    if (date is Timestamp) return date.toDate();
    if (date is String) return DateTime.tryParse(date) ?? DateTime.now();
    return DateTime.now();
  }

  Map<String, dynamic> toFirestore() {
    return {
      'productCode': productCode,
      'itemNumber': itemNumber,
      'location': location,
      'productName': productName,
      'quantity': quantity,
      'unit': unit,
      'price': price,
      'category': category,
      'image': image,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
    };
  }

  Product copyWith({
    String? id,
    String? productCode,
    String? itemNumber,
    String? location,
    String? productName,
    double? quantity,
    String? unit,
    double? price,
    String? category,
    String? image,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Product(
      id: id ?? this.id,
      productCode: productCode ?? this.productCode,
      itemNumber: itemNumber ?? this.itemNumber,
      location: location ?? this.location,
      productName: productName ?? this.productName,
      quantity: quantity ?? this.quantity,
      unit: unit ?? this.unit,
      price: price ?? this.price,
      category: category ?? this.category,
      image: image ?? this.image,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
