import { Product } from './types'

export interface BranchDemandPrediction {
  branchName: string
  branchId: string
  predictedProducts: {
    productCode: string
    productName: string
    predictedQuantity: number
    confidence: number
    urgencyLevel: 'high' | 'medium' | 'low'
    lastOrderDate?: string
    averageOrderFrequency: number
  }[]
  totalPredictedItems: number
  confidence: number
  nextExpectedOrderDate: string
}

export interface BranchOrderPattern {
  branchName: string
  orderFrequency: number // days between orders
  preferredProducts: string[]
  averageOrderSize: number
  peakOrderDays: number[] // days of week
  seasonalTrends: {
    month: string
    demandMultiplier: number
  }[]
}

export class BranchDemandPredictor {
  private products: Product[]
  private branchPatterns: Map<string, BranchOrderPattern>

  constructor(products: Product[]) {
    this.products = products
    this.branchPatterns = new Map()
    this.initializeBranchPatterns()
  }

  private initializeBranchPatterns() {
    // Initialize patterns for different branch types
    const defaultPattern: BranchOrderPattern = {
      orderFrequency: 7, // Weekly orders
      preferredProducts: [],
      averageOrderSize: 50,
      peakOrderDays: [1, 2, 3], // Monday, Tuesday, Wednesday
      seasonalTrends: [
        { month: '01', demandMultiplier: 0.8 },
        { month: '02', demandMultiplier: 0.9 },
        { month: '03', demandMultiplier: 1.1 },
        { month: '04', demandMultiplier: 1.2 },
        { month: '05', demandMultiplier: 1.3 },
        { month: '06', demandMultiplier: 1.4 },
        { month: '07', demandMultiplier: 1.3 },
        { month: '08', demandMultiplier: 1.2 },
        { month: '09', demandMultiplier: 1.1 },
        { month: '10', demandMultiplier: 1.0 },
        { month: '11', demandMultiplier: 1.2 },
        { month: '12', demandMultiplier: 1.5 }
      ]
    }

    // Set patterns for known branches (you can customize these)
    this.branchPatterns.set('main', { ...defaultPattern, orderFrequency: 5, averageOrderSize: 100 })
    this.branchPatterns.set('branch1', { ...defaultPattern, orderFrequency: 7, averageOrderSize: 75 })
    this.branchPatterns.set('branch2', { ...defaultPattern, orderFrequency: 10, averageOrderSize: 60 })
    this.branchPatterns.set('branch3', { ...defaultPattern, orderFrequency: 14, averageOrderSize: 40 })
  }

  predictAllBranchesDemand(): BranchDemandPrediction[] {
    const predictions: BranchDemandPrediction[] = []

    // Get all branches from the database or use default branches
    const branches = this.getAllBranches()

    branches.forEach(branch => {
      const prediction = this.predictBranchDemand(branch.id, branch.name)
      if (prediction) {
        predictions.push(prediction)
      }
    })

    return predictions.sort((a, b) => b.totalPredictedItems - a.totalPredictedItems)
  }

  private getAllBranches(): { id: string; name: string }[] {
    // This would typically come from your database
    // For now, using default branches
    return [
      { id: 'main', name: 'الفرع الرئيسي' },
      { id: 'branch1', name: 'فرع الرياض' },
      { id: 'branch2', name: 'فرع جدة' },
      { id: 'branch3', name: 'فرع الدمام' }
    ]
  }

  predictBranchDemand(branchId: string, branchName: string): BranchDemandPrediction | null {
    const pattern = this.branchPatterns.get(branchId)
    if (!pattern) return null

    const currentMonth = new Date().getMonth() + 1
    const monthKey = currentMonth.toString().padStart(2, '0')
    const seasonalTrend = pattern.seasonalTrends.find(t => t.month === monthKey)
    const seasonalMultiplier = seasonalTrend?.demandMultiplier || 1.0

    // Predict products for this branch
    const predictedProducts = this.predictProductsForBranch(pattern, seasonalMultiplier)

    // Calculate total and confidence
    const totalPredictedItems = predictedProducts.reduce((sum, p) => sum + p.predictedQuantity, 0)
    const confidence = this.calculateBranchConfidence(pattern, predictedProducts)

    // Predict next order date
    const nextExpectedOrderDate = this.predictNextOrderDate(pattern)

    return {
      branchName,
      branchId,
      predictedProducts,
      totalPredictedItems,
      confidence,
      nextExpectedOrderDate
    }
  }

  private predictProductsForBranch(pattern: BranchOrderPattern, seasonalMultiplier: number): any[] {
    const predictions: any[] = []

    this.products.forEach(product => {
      const prediction = this.predictProductForBranch(product, pattern, seasonalMultiplier)
      if (prediction && prediction.predictedQuantity > 0) {
        predictions.push(prediction)
      }
    })

    return predictions.sort((a, b) => b.predictedQuantity - a.predictedQuantity)
  }

  private predictProductForBranch(product: Product, pattern: BranchOrderPattern, seasonalMultiplier: number): any | null {
    // Base demand calculation
    let baseDemand = this.calculateBaseProductDemand(product)
    
    // Apply branch-specific factors
    const branchMultiplier = this.getBranchProductMultiplier(product, pattern)
    const seasonalMultiplier = seasonalMultiplier
    const frequencyMultiplier = pattern.orderFrequency > 0 ? Math.min(2.0, 7 / pattern.orderFrequency) : 1.0

    // Calculate predicted quantity
    const predictedQuantity = Math.ceil(
      baseDemand * branchMultiplier * seasonalMultiplier * frequencyMultiplier
    )

    // Calculate confidence
    const confidence = this.calculateProductConfidence(product, pattern)

    // Determine urgency
    const urgencyLevel = this.determineUrgencyLevel(predictedQuantity, confidence, product.currentStock)

    // Skip if demand is too low
    if (predictedQuantity < 1) return null

    return {
      productCode: product.productCode,
      productName: product.productName,
      predictedQuantity,
      confidence,
      urgencyLevel,
      averageOrderFrequency: pattern.orderFrequency
    }
  }

  private calculateBaseProductDemand(product: Product): number {
    let demand = 0

    // Base demand on product characteristics
    if (product.issues && product.issues > 0) {
      demand += product.issues * 0.3 // Weight recent issues
    }

    if (product.purchases && product.purchases > 0) {
      demand += product.purchases * 0.2 // Weight purchases
    }

    // Category-based demand
    const categoryDemand = this.getCategoryDemand(product.category)
    demand += categoryDemand

    // Price-based demand (cheaper items have higher demand)
    if (product.price > 0) {
      const priceDemand = Math.max(1, Math.min(20, 1000 / product.price))
      demand += priceDemand
    }

    return demand
  }

  private getCategoryDemand(category: string): number {
    const demands: Record<string, number> = {
      'إلكترونيات': 8,
      'أثاث': 5,
      'مواد غذائية': 15,
      'ملابس': 12,
      'أدوات': 7,
      'طبية': 4,
      'رياضية': 6,
      'كتب': 3,
      'ألعاب': 9,
      'أخرى': 5
    }
    
    return demands[category] || 5
  }

  private getBranchProductMultiplier(product: Product, pattern: BranchOrderPattern): number {
    // Check if this is a preferred product for the branch
    if (pattern.preferredProducts.includes(product.productCode)) {
      return 1.5 // 50% higher demand for preferred products
    }

    // Adjust based on average order size
    const sizeMultiplier = pattern.averageOrderSize / 50 // Normalize to base of 50
    return Math.max(0.5, Math.min(2.0, sizeMultiplier))
  }

  private calculateProductConfidence(product: Product, pattern: BranchOrderPattern): number {
    let confidence = 0.5 // Base confidence

    // Higher confidence for products with more data
    if (product.issues > 10) confidence += 0.2
    if (product.purchases > 10) confidence += 0.2
    if (product.currentStock > 0) confidence += 0.1

    // Adjust based on branch pattern stability
    if (pattern.orderFrequency < 10) confidence += 0.1 // Frequent orders = more data

    return Math.max(0.1, Math.min(1.0, confidence))
  }

  private calculateBranchConfidence(pattern: BranchOrderPattern, predictions: any[]): number {
    if (predictions.length === 0) return 0.1

    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
    
    // Adjust based on pattern stability
    const frequencyStability = pattern.orderFrequency < 14 ? 0.1 : 0
    const productVariety = Math.min(0.2, predictions.length / 50)

    return Math.max(0.1, Math.min(1.0, avgConfidence + frequencyStability + productVariety))
  }

  private determineUrgencyLevel(predictedQuantity: number, confidence: number, currentStock: number): 'high' | 'medium' | 'low' {
    const score = (predictedQuantity * confidence) / Math.max(1, currentStock)
    
    if (score > 2.0) return 'high'
    if (score > 1.0) return 'medium'
    return 'low'
  }

  private predictNextOrderDate(pattern: BranchOrderPattern): string {
    const today = new Date()
    const daysUntilNextOrder = pattern.orderFrequency
    const nextOrderDate = new Date(today)
    nextOrderDate.setDate(today.getDate() + daysUntilNextOrder)
    
    return nextOrderDate.toISOString().split('T')[0]
  }

  generateBranchDemandReport(): string {
    const predictions = this.predictAllBranchesDemand()
    
    return `
=== تقرير توقعات طلبات الفروع ===
تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}

=== ملخص الفروع ===
إجمالي الفروع: ${predictions.length}
إجمالي العناصر المتوقعة: ${predictions.reduce((sum, p) => sum + p.totalPredictedItems, 0)}

=== توقعات كل فرع ===
${predictions.map(prediction => `
🏢 ${prediction.branchName}
   📦 إجمالي متوقع: ${prediction.totalPredictedItems} عنصر
   📅 التاريخ المتوقع: ${prediction.nextExpectedOrderDate}
   🎯 الثقة: ${(prediction.confidence * 100).toFixed(1)}%
   
   📋 المنتجات المتوقعة:
   ${prediction.predictedProducts.slice(0, 5).map(p => 
     `   • ${p.productName}: ${p.predictedQuantity} وحدة (${p.urgencyLevel === 'high' ? 'عاجل' : p.urgencyLevel === 'medium' ? 'متوسط' : 'منخفض'})`
   ).join('\n')}
`).join('\n')}

=== المنتجات الأعلى طلباً ===
${this.getTopRequestedProducts(predictions).slice(0, 10).map((item, i) => 
  `${i + 1}. ${item.productName} - ${item.totalQuantity} وحدة (${item.branchCount} فرع)`
).join('\n')}

=== توصيات سريعة ===
${this.generateQuickRecommendations(predictions).slice(0, 5).map(rec => 
  `💡 ${rec}`
).join('\n')}
    `.trim()
  }

  private getTopRequestedProducts(predictions: BranchDemandPrediction[]): any[] {
    const productMap = new Map<string, { productName: string; totalQuantity: number; branchCount: number }>()

    predictions.forEach(prediction => {
      prediction.predictedProducts.forEach(product => {
        const existing = productMap.get(product.productCode) || {
          productName: product.productName,
          totalQuantity: 0,
          branchCount: 0
        }
        
        existing.totalQuantity += product.predictedQuantity
        existing.branchCount += 1
        
        productMap.set(product.productCode, existing)
      })
    })

    return Array.from(productMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
  }

  private generateQuickRecommendations(predictions: BranchDemandPrediction[]): string[] {
    const recommendations: string[] = []

    // Check for high-demand products
    const highDemandProducts = this.getTopRequestedProducts(predictions).slice(0, 3)
    highDemandProducts.forEach(product => {
      if (product.totalQuantity > 50) {
        recommendations.push(`زيادة مخزون "${product.productName}" - طلب من ${product.branchCount} فرع`)
      }
    })

    // Check for branches with high predicted demand
    const highDemandBranches = predictions.filter(p => p.totalPredictedItems > 100)
    highDemandBranches.forEach(branch => {
      recommendations.push(`استعداد لطلب كبير من "${branch.branchName}" - ${branch.totalPredictedItems} عنصر متوقع`)
    })

    // Check for urgent items
    const urgentItems = predictions.flatMap(p => p.predictedProducts.filter(pr => pr.urgencyLevel === 'high'))
    if (urgentItems.length > 0) {
      recommendations.push(`${urgentItems.length} منتج تحتاج طلب عاجل من الفروع`)
    }

    return recommendations
  }

  // Method to update branch patterns based on real data
  updateBranchPattern(branchId: string, newPattern: Partial<BranchOrderPattern>) {
    const existing = this.branchPatterns.get(branchId)
    if (existing) {
      this.branchPatterns.set(branchId, { ...existing, ...newPattern })
    }
  }

  // Method to add preferred products for a branch
  addPreferredProduct(branchId: string, productCode: string) {
    const pattern = this.branchPatterns.get(branchId)
    if (pattern) {
      if (!pattern.preferredProducts.includes(productCode)) {
        pattern.preferredProducts.push(productCode)
      }
    }
  }
}
