import { Product } from './types'

export interface BranchHistoryData {
  branchId: string
  branchName: string
  productHistory: {
    productCode: string
    productName: string
    deliveries: {
      date: string
      quantity: number
      frequency: number // days since last delivery
    }[]
    totalDelivered: number
    averageDeliverySize: number
    deliveryFrequency: number // average days between deliveries
    lastDeliveryDate: string
    trend: 'increasing' | 'decreasing' | 'stable'
  }[]
  overallPattern: {
    totalDeliveries: number
    averageOrderValue: number
    preferredDeliveryDays: number[]
    seasonalAdjustments: Record<string, number>
  }
}

export interface BranchNextOrderPrediction {
  branchId: string
  branchName: string
  nextOrderPrediction: {
    expectedDate: string
    confidence: number
    predictedProducts: {
      productCode: string
      productName: string
      predictedQuantity: number
      confidence: number
      reasoning: string
      lastDeliveryQuantity: number
      averageDeliveryQuantity: number
      daysSinceLastDelivery: number
      urgencyLevel: 'critical' | 'high' | 'medium' | 'low'
    }[]
    totalPredictedQuantity: number
    estimatedValue: number
    factors: string[]
  }
}

export class AdvancedBranchPredictor {
  private products: Product[]
  private branchHistory: Map<string, BranchHistoryData>

  constructor(products: Product[]) {
    this.products = products
    this.branchHistory = new Map()
    this.initializeBranchHistory()
  }

  private initializeBranchHistory() {
    // This would typically load from your database
    // For now, I'll create a sample structure
    const sampleBranches = [
      {
        branchId: 'main',
        branchName: 'الفرع الرئيسي',
        productHistory: this.generateSampleHistory('main')
      },
      {
        branchId: 'riyadh',
        branchName: 'فرع الرياض',
        productHistory: this.generateSampleHistory('riyadh')
      },
      {
        branchId: 'jeddah',
        branchName: 'فرع جدة',
        productHistory: this.generateSampleHistory('jeddah')
      }
    ]

    sampleBranches.forEach(branch => {
      this.branchHistory.set(branch.branchId, {
        ...branch,
        overallPattern: this.calculateOverallPattern(branch.productHistory)
      })
    })
  }

  private generateSampleHistory(branchId: string): any[] {
    // Generate sample delivery history for demonstration
    // In real implementation, this would come from your database
    const sampleProducts = this.products.slice(0, 5)
    
    return sampleProducts.map(product => {
      const deliveries = this.generateSampleDeliveries(product, branchId)
      const totalDelivered = deliveries.reduce((sum, d) => sum + d.quantity, 0)
      const averageDeliverySize = totalDelivered / deliveries.length
      const deliveryFrequency = this.calculateAverageFrequency(deliveries)
      const trend = this.calculateTrend(deliveries)
      
      return {
        productCode: product.productCode,
        productName: product.productName,
        deliveries,
        totalDelivered,
        averageDeliverySize,
        deliveryFrequency,
        lastDeliveryDate: deliveries[deliveries.length - 1]?.date || '',
        trend
      }
    })
  }

  private generateSampleDeliveries(product: Product, branchId: string): any[] {
    const deliveries: any[] = []
    const today = new Date()
    
    // Generate sample deliveries over the last 6 months
    for (let i = 0; i < 6; i++) {
      const deliveryDate = new Date(today)
      deliveryDate.setMonth(today.getMonth() - i)
      
      // Random quantity based on product characteristics
      const baseQuantity = this.getBaseDemandForProduct(product)
      const quantity = Math.max(1, Math.floor(baseQuantity + (Math.random() - 0.5) * 10))
      
      deliveries.push({
        date: deliveryDate.toISOString().split('T')[0],
        quantity,
        frequency: i === 0 ? 0 : 30 // Approximate 30 days between deliveries
      })
    }
    
    return deliveries.reverse()
  }

  private getBaseDemandForProduct(product: Product): number {
    // Calculate base demand based on product characteristics
    let demand = 10
    
    if (product.category === 'إلكترونيات') demand = 5
    if (product.category === 'مواد غذائية') demand = 20
    if (product.category === 'أثاث') demand = 3
    
    if (product.price > 1000) demand *= 0.5
    if (product.price < 100) demand *= 2
    
    return Math.max(1, demand)
  }

  private calculateAverageFrequency(deliveries: any[]): number {
    if (deliveries.length < 2) return 30
    
    let totalFrequency = 0
    for (let i = 1; i < deliveries.length; i++) {
      const prevDate = new Date(deliveries[i - 1].date)
      const currDate = new Date(deliveries[i].date)
      const daysDiff = Math.abs((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      totalFrequency += daysDiff
    }
    
    return totalFrequency / (deliveries.length - 1)
  }

  private calculateTrend(deliveries: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (deliveries.length < 3) return 'stable'
    
    const recent = deliveries.slice(0, 2).reduce((sum, d) => sum + d.quantity, 0) / 2
    const older = deliveries.slice(2, 4).reduce((sum, d) => sum + d.quantity, 0) / 2
    
    if (recent > older * 1.2) return 'increasing'
    if (recent < older * 0.8) return 'decreasing'
    return 'stable'
  }

  private calculateOverallPattern(productHistory: any[]): any {
    const totalDeliveries = productHistory.reduce((sum, p) => sum + p.totalDelivered, 0)
    const averageOrderValue = totalDeliveries / productHistory.length
    
    return {
      totalDeliveries,
      averageOrderValue,
      preferredDeliveryDays: [1, 2, 3], // Monday, Tuesday, Wednesday
      seasonalAdjustments: {
        '01': 0.9, '02': 0.95, '03': 1.05, '04': 1.1, '05': 1.2, '06': 1.3,
        '07': 1.25, '08': 1.15, '09': 1.05, '10': 1.0, '11': 1.1, '12': 1.4
      }
    }
  }

  predictNextOrderForBranch(branchId: string): BranchNextOrderPrediction | null {
    const history = this.branchHistory.get(branchId)
    if (!history) return null

    const predictedProducts = this.predictProductsForBranch(history)
    const expectedDate = this.predictNextOrderDate(history)
    const confidence = this.calculatePredictionConfidence(history, predictedProducts)
    const totalQuantity = predictedProducts.reduce((sum, p) => sum + p.predictedQuantity, 0)
    const estimatedValue = this.estimateOrderValue(predictedProducts)
    const factors = this.generatePredictionFactors(history, predictedProducts)

    return {
      branchId: history.branchId,
      branchName: history.branchName,
      nextOrderPrediction: {
        expectedDate,
        confidence,
        predictedProducts,
        totalPredictedQuantity: totalQuantity,
        estimatedValue,
        factors
      }
    }
  }

  private predictProductsForBranch(history: BranchHistoryData): any[] {
    const predictions: any[] = []

    history.productHistory.forEach(productHistory => {
      const prediction = this.predictNextProductDelivery(productHistory, history.overallPattern)
      if (prediction && prediction.predictedQuantity > 0) {
        predictions.push(prediction)
      }
    })

    return predictions.sort((a, b) => b.predictedQuantity - a.predictedQuantity)
  }

  private predictNextProductDelivery(productHistory: any, overallPattern: any): any | null {
    const { deliveries, averageDeliverySize, deliveryFrequency, trend, lastDeliveryDate } = productHistory
    
    // Calculate days since last delivery
    const daysSinceLastDelivery = lastDeliveryDate ? 
      this.getDaysSince(lastDeliveryDate) : deliveryFrequency

    // Base prediction on historical patterns
    let predictedQuantity = averageDeliverySize
    
    // Adjust for trend
    if (trend === 'increasing') predictedQuantity *= 1.2
    if (trend === 'decreasing') predictedQuantity *= 0.8
    
    // Adjust for seasonal factors
    const currentMonth = new Date().getMonth() + 1
    const monthKey = currentMonth.toString().padStart(2, '0')
    const seasonalFactor = overallPattern.seasonalAdjustments[monthKey] || 1.0
    predictedQuantity *= seasonalFactor
    
    // Adjust for urgency (overdue deliveries)
    const urgencyFactor = daysSinceLastDelivery > deliveryFrequency ? 1.5 : 1.0
    predictedQuantity *= urgencyFactor
    
    // Calculate confidence
    const confidence = this.calculateProductConfidence(productHistory, daysSinceLastDelivery)
    
    // Determine urgency level
    const urgencyLevel = this.determineUrgencyLevel(
      daysSinceLastDelivery, 
      deliveryFrequency, 
      predictedQuantity, 
      confidence
    )
    
    // Generate reasoning
    const reasoning = this.generateProductReasoning(
      productHistory, 
      trend, 
      daysSinceLastDelivery, 
      seasonalFactor
    )

    return {
      productCode: productHistory.productCode,
      productName: productHistory.productName,
      predictedQuantity: Math.max(1, Math.round(predictedQuantity)),
      confidence,
      reasoning,
      lastDeliveryQuantity: deliveries[deliveries.length - 1]?.quantity || 0,
      averageDeliveryQuantity: averageDeliverySize,
      daysSinceLastDelivery,
      urgencyLevel
    }
  }

  private calculateProductConfidence(productHistory: any, daysSinceLastDelivery: number): number {
    let confidence = 0.5 // Base confidence
    
    // More deliveries = higher confidence
    const deliveryCount = productHistory.deliveries.length
    confidence += Math.min(0.3, deliveryCount * 0.05)
    
    // Consistent frequency = higher confidence
    const frequencyVariance = this.calculateFrequencyVariance(productHistory.deliveries)
    confidence += Math.max(0, 0.2 - frequencyVariance * 0.1)
    
    // Recent deliveries = higher confidence
    if (daysSinceLastDelivery <= productHistory.deliveryFrequency * 1.5) {
      confidence += 0.1
    }
    
    return Math.max(0.1, Math.min(1.0, confidence))
  }

  private calculateFrequencyVariance(deliveries: any[]): number {
    if (deliveries.length < 3) return 1.0
    
    const frequencies = []
    for (let i = 1; i < deliveries.length; i++) {
      const prevDate = new Date(deliveries[i - 1].date)
      const currDate = new Date(deliveries[i].date)
      const daysDiff = Math.abs((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      frequencies.push(daysDiff)
    }
    
    const mean = frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length
    const variance = frequencies.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / frequencies.length
    
    return Math.sqrt(variance) / mean
  }

  private determineUrgencyLevel(
    daysSinceLastDelivery: number, 
    deliveryFrequency: number, 
    predictedQuantity: number, 
    confidence: number
  ): 'critical' | 'high' | 'medium' | 'low' {
    const overdueRatio = daysSinceLastDelivery / deliveryFrequency
    const demandScore = predictedQuantity * confidence
    
    if (overdueRatio > 2.0 || demandScore > 50) return 'critical'
    if (overdueRatio > 1.5 || demandScore > 30) return 'high'
    if (overdueRatio > 1.0 || demandScore > 15) return 'medium'
    return 'low'
  }

  private generateProductReasoning(
    productHistory: any, 
    trend: string, 
    daysSinceLastDelivery: number, 
    seasonalFactor: number
  ): string {
    const reasons: string[] = []
    
    reasons.push(`متوسط التسليم: ${productHistory.averageDeliverySize.toFixed(1)} وحدة`)
    reasons.push(`التردد المعتاد: كل ${productHistory.deliveryFrequency.toFixed(0)} يوم`)
    
    if (trend === 'increasing') reasons.push('طلب متزايد')
    if (trend === 'decreasing') reasons.push('طلب متناقص')
    
    if (daysSinceLastDelivery > productHistory.deliveryFrequency) {
      reasons.push(`متأخر عن المعتاد بـ ${(daysSinceLastDelivery - productHistory.deliveryFrequency).toFixed(0)} يوم`)
    }
    
    if (seasonalFactor > 1.1) reasons.push('موسم ذروة')
    if (seasonalFactor < 0.9) reasons.push('موسم منخفض')
    
    return reasons.join(' • ')
  }

  private predictNextOrderDate(history: BranchHistoryData): string {
    // Find the most common delivery frequency
    const frequencies = history.productHistory.map(p => p.deliveryFrequency)
    const averageFrequency = frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length
    
    // Calculate next expected date based on last deliveries
    const lastDeliveryDates = history.productHistory
      .filter(p => p.lastDeliveryDate)
      .map(p => new Date(p.lastDeliveryDate))
    
    if (lastDeliveryDates.length === 0) {
      // No history, predict based on average frequency
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + averageFrequency)
      return nextDate.toISOString().split('T')[0]
    }
    
    const lastDelivery = new Date(Math.max(...lastDeliveryDates.map(d => d.getTime())))
    const nextDate = new Date(lastDelivery)
    nextDate.setDate(lastDelivery.getDate() + averageFrequency)
    
    return nextDate.toISOString().split('T')[0]
  }

  private calculatePredictionConfidence(history: BranchHistoryData, predictedProducts: any[]): number {
    if (predictedProducts.length === 0) return 0.1
    
    const avgProductConfidence = predictedProducts.reduce((sum, p) => sum + p.confidence, 0) / predictedProducts.length
    
    // Adjust based on data quality
    const dataQuality = Math.min(1.0, history.productHistory.length / 10)
    
    return (avgProductConfidence * 0.7) + (dataQuality * 0.3)
  }

  private estimateOrderValue(predictedProducts: any[]): number {
    return predictedProducts.reduce((sum, product) => {
      const product = this.products.find(p => p.productCode === product.productCode)
      const value = product ? product.price * product.predictedQuantity : 0
      return sum + value
    }, 0)
  }

  private generatePredictionFactors(history: BranchHistoryData, predictedProducts: any[]): string[] {
    const factors: string[] = []
    
    factors.push(`تاريخ الطلب: ${history.productHistory.length} طلب سابق`)
    factors.push(`متوسط حجم الطلب: ${history.overallPattern.averageOrderValue.toFixed(0)} وحدة`)
    
    const urgentProducts = predictedProducts.filter(p => p.urgencyLevel === 'critical' || p.urgencyLevel === 'high')
    if (urgentProducts.length > 0) {
      factors.push(`${urgentProducts.length} منتجات تحتاج اهتمام عاجل`)
    }
    
    const increasingProducts = history.productHistory.filter(p => p.trend === 'increasing')
    if (increasingProducts.length > 0) {
      factors.push(`${increasingProducts.length} منتجات ذات طلب متزايد`)
    }
    
    return factors
  }

  private getDaysSince(dateString: string): number {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  // Method to update branch history with new delivery data
  updateBranchHistory(branchId: string, productCode: string, quantity: number, date: string) {
    const history = this.branchHistory.get(branchId)
    if (!history) return

    const productHistory = history.productHistory.find(p => p.productCode === productCode)
    if (!productHistory) return

    // Add new delivery
    productHistory.deliveries.push({
      date,
      quantity,
      frequency: this.getDaysSince(productHistory.lastDeliveryDate)
    })

    // Update calculations
    productHistory.totalDelivered += quantity
    productHistory.averageDeliverySize = productHistory.totalDelivered / productHistory.deliveries.length
    productHistory.deliveryFrequency = this.calculateAverageFrequency(productHistory.deliveries)
    productHistory.lastDeliveryDate = date
    productHistory.trend = this.calculateTrend(productHistory.deliveries)

    // Update overall pattern
    history.overallPattern = this.calculateOverallPattern(history.productHistory)
  }

  // Generate comprehensive report for all branches
  generateAllBranchesReport(): string {
    const reports: string[] = []
    
    this.branchHistory.forEach((history, branchId) => {
      const prediction = this.predictNextOrderForBranch(branchId)
      if (prediction) {
        reports.push(this.generateBranchReport(prediction))
      }
    })

    return `
=== تقرير شامل لتوقعات طلبات الفروع ===
تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}

${reports.join('\n\n')}

=== ملخص إجمالي ===
إجمالي الفروع: ${this.branchHistory.size}
إجمالي الطلبات المتوقعة: ${this.calculateTotalPredictedOrders()}
أعلى الفروع طلباً: ${this.getTopBranches().slice(0, 3).map(b => b.branchName).join(', ')}

=== توصيات استراتيجية ===
${this.generateStrategicRecommendations()}
    `.trim()
  }

  private generateBranchReport(prediction: BranchNextOrderPrediction): string {
    const { branchName, nextOrderPrediction } = prediction
    
    return `
🏢 فرع: ${branchName}
📅 التاريخ المتوقع: ${nextOrderPrediction.expectedDate}
🎯 الثقة: ${(nextOrderPrediction.confidence * 100).toFixed(1)}%
📦 إجمالي متوقع: ${nextOrderPrediction.totalPredictedQuantity} وحدة
💰 القيمة التقديرية: ${nextOrderPrediction.estimatedValue.toFixed(0)} ريال

📋 المنتجات المتوقعة:
${nextOrderPrediction.predictedProducts.map(p => 
  `   ${p.urgencyLevel === 'critical' ? '🚨' : p.urgencyLevel === 'high' ? '⚠️' : '📦'} ${p.productName}: ${p.predictedQuantity} وحدة (${(p.confidence * 100).toFixed(0)}% ثقة)
   ${p.reasoning}`
).join('\n\n')}

📊 عوامل التنبؤ:
${nextOrderPrediction.factors.map(f => `   • ${f}`).join('\n')}
    `
  }

  private calculateTotalPredictedOrders(): number {
    let total = 0
    this.branchHistory.forEach((history, branchId) => {
      const prediction = this.predictNextOrderForBranch(branchId)
      if (prediction) {
        total += prediction.nextOrderPrediction.totalPredictedQuantity
      }
    })
    return total
  }

  private getTopBranches(): any[] {
    const branches: any[] = []
    
    this.branchHistory.forEach((history, branchId) => {
      const prediction = this.predictNextOrderForBranch(branchId)
      if (prediction) {
        branches.push({
          branchName: history.branchName,
          predictedQuantity: prediction.nextOrderPrediction.totalPredictedQuantity
        })
      }
    })

    return branches.sort((a, b) => b.predictedQuantity - a.predictedQuantity)
  }

  private generateStrategicRecommendations(): string {
    const recommendations: string[] = []
    
    // Check for branches with urgent needs
    this.branchHistory.forEach((history, branchId) => {
      const prediction = this.predictNextOrderForBranch(branchId)
      if (prediction) {
        const urgentProducts = prediction.nextOrderPrediction.predictedProducts.filter(p => 
          p.urgencyLevel === 'critical' || p.urgencyLevel === 'high'
        )
        
        if (urgentProducts.length > 0) {
          recommendations.push(`🔴 ${history.branchName}: ${urgentProducts.length} منتجات تحتاج اهتمام فوري`)
        }
      }
    })

    // Check for seasonal trends
    const currentMonth = new Date().getMonth() + 1
    const season = currentMonth >= 3 && currentMonth <= 8 ? 'ذروة' : 'منخفض'
    recommendations.push(`📊 الموسم الحالي: ${season} - ضبط المخزون وفقاً لذلك`)

    return recommendations.join('\n')
  }
}
