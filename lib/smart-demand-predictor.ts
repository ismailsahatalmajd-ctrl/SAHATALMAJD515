import { Product } from './types'

export interface SimplePrediction {
  productCode: string
  productName: string
  currentStock: number
  predictedMonthlyDemand: number
  recommendedOrderQuantity: number
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  nextOrderDate: string
}

export interface SimpleAlert {
  type: 'stock_out' | 'low_stock' | 'overstock'
  productCode: string
  productName: string
  message: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export class SimpleDemandPredictor {
  private products: Product[]
  private businessRules: Map<string, any>

  constructor(products: Product[]) {
    this.products = products
    this.businessRules = this.initializeBusinessRules()
  }

  private initializeBusinessRules(): Map<string, any> {
    const rules = new Map<string, any>()
    
    rules.set('safety_stock_percentage', 0.2) // 20%
    rules.set('min_order_quantity', 5)
    rules.set('max_order_quantity', 1000)
    rules.set('reorder_point_percentage', 0.3) // 30% of average demand
    rules.set('standard_lead_time', 7) // days
    
    return rules
  }

  generatePredictions(): SimplePrediction[] {
    const predictions: SimplePrediction[] = []

    this.products.forEach(product => {
      const prediction = this.predictProductDemand(product)
      if (prediction) {
        predictions.push(prediction)
      }
    })

    return predictions.sort((a, b) => {
      const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      return urgencyOrder[b.urgencyLevel] - urgencyOrder[a.urgencyLevel]
    })
  }

  private predictProductDemand(product: Product): SimplePrediction | null {
    // Simple prediction based on current stock and historical patterns
    const currentStock = product.currentStock
    const averageMonthlyDemand = this.estimateAverageDemand(product)
    
    if (averageMonthlyDemand === 0) {
      return null // No demand data
    }

    // Calculate recommended order quantity
    const safetyStock = averageMonthlyDemand * this.businessRules.get('safety_stock_percentage')
    const reorderPoint = averageMonthlyDemand * this.businessRules.get('reorder_point_percentage')
    
    let recommendedOrderQuantity = 0
    let urgencyLevel: 'critical' | 'high' | 'medium' | 'low' = 'low'
    
    if (currentStock === 0) {
      recommendedOrderQuantity = Math.ceil(averageMonthlyDemand * 2 + safetyStock)
      urgencyLevel = 'critical'
    } else if (currentStock < reorderPoint) {
      recommendedOrderQuantity = Math.ceil(averageMonthlyDemand - currentStock + safetyStock)
      urgencyLevel = currentStock < reorderPoint * 0.5 ? 'high' : 'medium'
    } else if (currentStock > averageMonthlyDemand * 3) {
      recommendedOrderQuantity = 0
      urgencyLevel = 'low'
    }

    // Apply business rules
    recommendedOrderQuantity = Math.max(
      this.businessRules.get('min_order_quantity'),
      Math.min(this.businessRules.get('max_order_quantity'), recommendedOrderQuantity)
    )

    // Calculate confidence based on product data quality
    const confidence = this.calculateSimpleConfidence(product)

    // Predict next order date
    const nextOrderDate = this.predictNextOrderDate(currentStock, averageMonthlyDemand, urgencyLevel)

    return {
      productCode: product.productCode,
      productName: product.productName,
      currentStock,
      predictedMonthlyDemand: Math.ceil(averageMonthlyDemand),
      recommendedOrderQuantity,
      urgencyLevel,
      confidence,
      nextOrderDate
    }
  }

  private estimateAverageDemand(product: Product): number {
    // Simple estimation based on product characteristics
    let baseDemand = 0

    // Estimate based on current stock movement
    if (product.issues && product.issues > 0) {
      baseDemand = product.issues / 3 // Assume issues over 3 months
    } else if (product.purchases && product.purchases > 0) {
      baseDemand = product.purchases / 3 // Assume purchases over 3 months
    }

    // Adjust based on product category
    if (product.category) {
      const categoryMultiplier = this.getCategoryMultiplier(product.category)
      baseDemand *= categoryMultiplier
    }

    // Adjust based on price (cheaper items usually have higher demand)
    if (product.price > 0) {
      const priceFactor = Math.max(0.5, Math.min(2.0, 1000 / product.price))
      baseDemand *= priceFactor
    }

    return Math.max(0, baseDemand)
  }

  private getCategoryMultiplier(category: string): number {
    const multipliers: Record<string, number> = {
      'إلكترونيات': 1.2,
      'أثاث': 0.8,
      'مواد غذائية': 1.5,
      'ملابس': 1.3,
      'أدوات': 1.1,
      'طبية': 0.9,
      'رياضية': 1.0,
      'كتب': 0.7,
      'ألعاب': 1.2,
      'أخرى': 1.0
    }
    
    return multipliers[category] || 1.0
  }

  private calculateSimpleConfidence(product: Product): number {
    let confidence = 0.5 // Base confidence

    // Higher confidence for products with more data
    if (product.issues > 10) confidence += 0.2
    if (product.purchases > 10) confidence += 0.2
    if (product.currentStock > 0) confidence += 0.1

    // Lower confidence for very new or very old products
    const daysSinceCreated = this.getDaysSince(product.createdAt)
    if (daysSinceCreated < 30) confidence -= 0.2
    if (daysSinceCreated > 365) confidence -= 0.1

    return Math.max(0.1, Math.min(1.0, confidence))
  }

  private predictNextOrderDate(currentStock: number, predictedDemand: number, urgencyLevel: string): string {
    const daysUntilStockOut = currentStock > 0 ? Math.ceil(currentStock / (predictedDemand / 30)) : 0
    const leadTime = this.businessRules.get('standard_lead_time')
    
    let nextOrderDate = new Date()
    
    if (urgencyLevel === 'critical') {
      nextOrderDate.setDate(nextOrderDate.getDate() + 1)
    } else if (urgencyLevel === 'high') {
      nextOrderDate.setDate(nextOrderDate.getDate() + Math.min(leadTime, daysUntilStockOut - leadTime))
    } else if (urgencyLevel === 'medium') {
      nextOrderDate.setDate(nextOrderDate.getDate() + daysUntilStockOut - leadTime)
    } else {
      nextOrderDate.setDate(nextOrderDate.getDate() + 30) // Check again in a month
    }

    return nextOrderDate.toISOString().split('T')[0]
  }

  generateSimpleAlerts(): SimpleAlert[] {
    const predictions = this.generatePredictions()
    const alerts: SimpleAlert[] = []

    predictions.forEach(prediction => {
      if (prediction.urgencyLevel === 'critical') {
        alerts.push({
          type: 'stock_out',
          productCode: prediction.productCode,
          productName: prediction.productName,
          message: `المنتج "${prediction.productName}" نفد من المخزون ويحتاج طلب فوري`,
          priority: 'critical'
        })
      } else if (prediction.urgencyLevel === 'high') {
        alerts.push({
          type: 'low_stock',
          productCode: prediction.productCode,
          productName: prediction.productName,
          message: `المخزون منخفض لـ "${prediction.productName}"، الكمية الموصى بها: ${prediction.recommendedOrderQuantity}`,
          priority: 'high'
        })
      } else if (prediction.currentStock > prediction.predictedMonthlyDemand * 3) {
        alerts.push({
          type: 'overstock',
          productCode: prediction.productCode,
          productName: prediction.productName,
          message: `فائض مخزون لـ "${prediction.productName}"، نفكر في عروض ترويجية`,
          priority: 'low'
        })
      }
    })

    return alerts.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }

  generateOptimizedOrderList(): { productCode: string; quantity: number; reason: string }[] {
    const predictions = this.generatePredictions()
    const orderList: { productCode: string; quantity: number; reason: string }[] = []

    predictions.forEach(prediction => {
      if (prediction.recommendedOrderQuantity > 0) {
        let reason = ''
        
        if (prediction.urgencyLevel === 'critical') {
          reason = 'نفد المخزون - طلب عاجل'
        } else if (prediction.urgencyLevel === 'high') {
          reason = 'مخزون منخفض - إعادة تخزين'
        } else if (prediction.urgencyLevel === 'medium') {
          reason = 'تجديد مخزون وقائي'
        }

        orderList.push({
          productCode: prediction.productCode,
          quantity: prediction.recommendedOrderQuantity,
          reason
        })
      }
    })

    return orderList.sort((a, b) => b.quantity - a.quantity)
  }

  private getDaysSince(dateString: string): number {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  generateSimpleReport(): string {
    const predictions = this.generatePredictions()
    const alerts = this.generateSimpleAlerts()
    
    return `
=== تقرير التنبؤ المبسط بالطلبات ===
تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}

=== ملخص التوقعات ===
إجمالي المنتجات المحللة: ${predictions.length}
توقعات عاجلة: ${predictions.filter(p => p.urgencyLevel === 'critical').length}
توقعات عالية: ${predictions.filter(p => p.urgencyLevel === 'high').length}
توقعات متوسطة: ${predictions.filter(p => p.urgencyLevel === 'medium').length}

=== التنبيهات ===
${alerts.slice(0, 10).map(alert => 
  `${alert.type === 'stock_out' ? '🚨' : alert.type === 'low_stock' ? '⚠️' : '📦'} ${alert.message}
   الأولوية: ${alert.priority === 'critical' ? 'عاجلة' : alert.priority === 'high' ? 'عالية' : 'منخفضة'}
`).join('\n\n')}

=== قائمة الطلبات الموصى بها ===
${this.generateOptimizedOrderList().slice(0, 10).map(item => 
  `📋 ${item.productCode}: ${item.quantity} وحدة
   السبب: ${item.reason}`
).join('\n')}

=== المنتجات الأعلى طلباً ===
${predictions.slice(0, 5).map((pred, i) => 
  `${i + 1}. ${pred.productName}
   الطلب الشهري المتوقع: ${pred.predictedMonthlyDemand} وحدة
   الثقة: ${(pred.confidence * 100).toFixed(1)}%`
).join('\n')}
    `.trim()
  }
}
