import { Product, Issue, Branch } from './types'

export interface RealBranchHistory {
  branchId: string
  branchName: string
  issueHistory: {
    issueId: string
    invoiceNumber: string
    date: string
    totalProducts: number
    totalValue: number
    products: {
      productId: string
      productCode: string
      productName: string
      quantity: number
      unitPrice: number
      totalPrice: number
    }[]
  }[]
  productAnalysis: {
    productCode: string
    productName: string
    totalDelivered: number
    deliveryCount: number
    averageQuantity: number
    averageValue: number
    lastDeliveryDate: string
    deliveryFrequency: number // days between deliveries
    trend: 'increasing' | 'decreasing' | 'stable'
    confidence: number
  }[]
  overallPattern: {
    totalIssues: number
    totalValue: number
    averageOrderValue: number
    averageOrderSize: number
    preferredDays: number[]
    seasonalAdjustments: Record<string, number>
  }
}

export interface RealBranchPrediction {
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
      predictedValue: number
    }[]
    totalPredictedQuantity: number
    estimatedValue: number
    factors: string[]
  }
}

export class RealBranchPredictor {
  private products: Product[]
  private branches: Branch[]
  private issues: Issue[]
  private branchHistory: Map<string, RealBranchHistory>

  constructor(products: Product[], branches: Branch[], issues: Issue[]) {
    this.products = products
    this.branches = branches
    this.issues = issues
    this.branchHistory = new Map()
    this.analyzeAllBranches()
  }

  private analyzeAllBranches() {
    // Group issues by branch
    const issuesByBranch = new Map<string, Issue[]>()
    
    this.issues.forEach(issue => {
      if (issue.branchId) {
        const branchIssues = issuesByBranch.get(issue.branchId) || []
        branchIssues.push(issue)
        issuesByBranch.set(issue.branchId, branchIssues)
      }
    })

    // Analyze each branch
    issuesByBranch.forEach((branchIssues, branchId) => {
      const branch = this.branches.find(b => b.id === branchId)
      if (branch && branchIssues.length > 0) {
        const history = this.analyzeBranchHistory(branchId, branch.name, branchIssues)
        this.branchHistory.set(branchId, history)
      }
    })
  }

  private analyzeBranchHistory(branchId: string, branchName: string, issues: Issue[]): RealBranchHistory {
    // Sort issues by date
    const sortedIssues = issues.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    // Create issue history
    const issueHistory = sortedIssues.map(issue => ({
      issueId: issue.id,
      invoiceNumber: issue.invoiceNumber || issue.invoiceCode || '',
      date: issue.createdAt,
      totalProducts: issue.products?.length || 0,
      totalValue: issue.totalValue || 0,
      products: (issue.products || []).map(product => ({
        productId: product.productId,
        productCode: product.productCode,
        productName: product.productName,
        quantity: product.quantity,
        unitPrice: product.unitPrice || 0,
        totalPrice: product.totalPrice || 0
      }))
    }))

    // Analyze products
    const productAnalysis = this.analyzeProductsForBranch(issueHistory)

    // Calculate overall pattern
    const overallPattern = this.calculateOverallPattern(issueHistory)

    return {
      branchId,
      branchName,
      issueHistory,
      productAnalysis,
      overallPattern
    }
  }

  private analyzeProductsForBranch(issueHistory: any[]): any[] {
    const productMap = new Map<string, any>()

    issueHistory.forEach(issue => {
      issue.products.forEach((product: any) => {
        const existing = productMap.get(product.productCode) || {
          productCode: product.productCode,
          productName: product.productName,
          deliveries: [] as any[],
          totalDelivered: 0,
          totalValue: 0,
          deliveryCount: 0
        }

        existing.deliveries.push({
          date: issue.date,
          quantity: product.quantity,
          value: product.totalPrice
        })
        existing.totalDelivered += product.quantity
        existing.totalValue += product.totalPrice
        existing.deliveryCount++

        productMap.set(product.productCode, existing)
      })
    })

    // Calculate metrics for each product
    const analysis: any[] = []
    productMap.forEach((product, productCode) => {
      const averageQuantity = product.totalDelivered / product.deliveryCount
      const averageValue = product.totalValue / product.deliveryCount
      const deliveryFrequency = this.calculateAverageFrequency(product.deliveries)
      const trend = this.calculateTrend(product.deliveries)
      const confidence = this.calculateProductConfidence(product)
      const lastDeliveryDate = product.deliveries[product.deliveries.length - 1]?.date || ''

      analysis.push({
        productCode,
        productName: product.productName,
        totalDelivered: product.totalDelivered,
        deliveryCount: product.deliveryCount,
        averageQuantity,
        averageValue,
        lastDeliveryDate,
        deliveryFrequency,
        trend,
        confidence
      })
    })

    return analysis.sort((a, b) => b.totalDelivered - a.totalDelivered)
  }

  private calculateAverageFrequency(deliveries: any[]): number {
    if (deliveries.length < 2) return 30 // Default to 30 days
    
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
    
    const recent = deliveries.slice(0, Math.min(3, deliveries.length))
    const older = deliveries.slice(Math.min(3, deliveries.length), Math.min(6, deliveries.length))
    
    const recentAvg = recent.reduce((sum, d) => sum + d.quantity, 0) / recent.length
    const olderAvg = older.length > 0 ? older.reduce((sum, d) => sum + d.quantity, 0) / older.length : recentAvg
    
    if (recentAvg > olderAvg * 1.2) return 'increasing'
    if (recentAvg < olderAvg * 0.8) return 'decreasing'
    return 'stable'
  }

  private calculateProductConfidence(product: any): number {
    let confidence = 0.3 // Base confidence
    
    // More deliveries = higher confidence
    confidence += Math.min(0.4, product.deliveryCount * 0.1)
    
    // Consistent frequency = higher confidence
    const frequencyVariance = this.calculateFrequencyVariance(product.deliveries)
    confidence += Math.max(0, 0.3 - frequencyVariance * 0.1)
    
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
    
    if (frequencies.length === 0) return 1.0
    
    const mean = frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length
    const variance = frequencies.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / frequencies.length
    
    return Math.sqrt(variance) / mean
  }

  private calculateOverallPattern(issueHistory: any[]): any {
    const totalIssues = issueHistory.length
    const totalValue = issueHistory.reduce((sum, issue) => sum + issue.totalValue, 0)
    const averageOrderValue = totalValue / totalIssues
    const averageOrderSize = issueHistory.reduce((sum, issue) => sum + issue.totalProducts, 0) / totalIssues

    // Calculate preferred days of week
    const dayCounts = new Map<number, number>()
    issueHistory.forEach(issue => {
      const dayOfWeek = new Date(issue.date).getDay()
      dayCounts.set(dayOfWeek, (dayCounts.get(dayOfWeek) || 0) + 1)
    })
    
    const preferredDays = Array.from(dayCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0])

    // Calculate seasonal adjustments
    const seasonalAdjustments = this.calculateSeasonalAdjustments(issueHistory)

    return {
      totalIssues,
      totalValue,
      averageOrderValue,
      averageOrderSize,
      preferredDays,
      seasonalAdjustments
    }
  }

  private calculateSeasonalAdjustments(issueHistory: any[]): Record<string, number> {
    const monthlyData = new Map<string, number>()
    
    issueHistory.forEach(issue => {
      const month = issue.date.substring(5, 7) // MM format
      monthlyData.set(month, (monthlyData.get(month) || 0) + 1)
    })

    const totalMonths = monthlyData.size
    const averagePerMonth = totalMonths > 0 ? issueHistory.length / totalMonths : 1

    const adjustments: Record<string, number> = {}
    for (let i = 1; i <= 12; i++) {
      const month = i.toString().padStart(2, '0')
      const monthCount = monthlyData.get(month) || 0
      adjustments[month] = monthCount > 0 ? monthCount / averagePerMonth : 1.0
    }

    return adjustments
  }

  predictNextOrderForBranch(branchId: string): RealBranchPrediction | null {
    const history = this.branchHistory.get(branchId)
    if (!history) return null

    const predictedProducts = this.predictProductsForBranch(history)
    const expectedDate = this.predictNextOrderDate(history)
    const confidence = this.calculatePredictionConfidence(history, predictedProducts)
    const totalQuantity = predictedProducts.reduce((sum, p) => sum + p.predictedQuantity, 0)
    const estimatedValue = predictedProducts.reduce((sum, p) => sum + p.predictedValue, 0)
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

  private predictProductsForBranch(history: RealBranchHistory): any[] {
    const predictions: any[] = []

    history.productAnalysis.forEach(productAnalysis => {
      const prediction = this.predictNextProductDelivery(productAnalysis, history.overallPattern)
      if (prediction && prediction.predictedQuantity > 0) {
        predictions.push(prediction)
      }
    })

    return predictions.sort((a, b) => b.predictedQuantity - a.predictedQuantity)
  }

  private predictNextProductDelivery(productAnalysis: any, overallPattern: any): any | null {
    const { 
      averageQuantity, 
      deliveryFrequency, 
      trend, 
      lastDeliveryDate, 
      confidence: baseConfidence 
    } = productAnalysis

    // Calculate days since last delivery
    const daysSinceLastDelivery = lastDeliveryDate ? 
      this.getDaysSince(lastDeliveryDate) : deliveryFrequency

    // Base prediction on historical patterns
    let predictedQuantity = averageQuantity
    
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
    const confidence = this.calculateAdjustedConfidence(baseConfidence, daysSinceLastDelivery, deliveryFrequency)
    
    // Determine urgency level
    const urgencyLevel = this.determineUrgencyLevel(
      daysSinceLastDelivery, 
      deliveryFrequency, 
      predictedQuantity, 
      confidence
    )
    
    // Generate reasoning
    const reasoning = this.generateProductReasoning(
      productAnalysis, 
      trend, 
      daysSinceLastDelivery, 
      seasonalFactor,
      overallPattern
    )

    // Get product price for value calculation
    const product = this.products.find(p => p.productCode === productAnalysis.productCode)
    const unitPrice = product?.price || 0

    return {
      productCode: productAnalysis.productCode,
      productName: productAnalysis.productName,
      predictedQuantity: Math.max(1, Math.round(predictedQuantity)),
      confidence,
      reasoning,
      lastDeliveryQuantity: productAnalysis.deliveries[productAnalysis.deliveries.length - 1]?.quantity || 0,
      averageDeliveryQuantity: averageQuantity,
      daysSinceLastDelivery,
      urgencyLevel,
      predictedValue: Math.max(1, Math.round(predictedQuantity)) * unitPrice
    }
  }

  private calculateAdjustedConfidence(baseConfidence: number, daysSinceLastDelivery: number, deliveryFrequency: number): number {
    let confidence = baseConfidence
    
    // Recent deliveries = higher confidence
    if (daysSinceLastDelivery <= deliveryFrequency * 1.5) {
      confidence += 0.1
    } else if (daysSinceLastDelivery > deliveryFrequency * 2) {
      confidence -= 0.1
    }
    
    return Math.max(0.1, Math.min(1.0, confidence))
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
    productAnalysis: any, 
    trend: string, 
    daysSinceLastDelivery: number, 
    seasonalFactor: number,
    overallPattern: any
  ): string {
    const reasons: string[] = []
    
    reasons.push(`متوسط التسليم: ${productAnalysis.averageQuantity.toFixed(1)} وحدة`)
    reasons.push(`التردد المعتاد: كل ${productAnalysis.deliveryFrequency.toFixed(0)} يوم`)
    
    if (trend === 'increasing') reasons.push('طلب متزايد')
    if (trend === 'decreasing') reasons.push('طلب متناقص')
    
    if (daysSinceLastDelivery > productAnalysis.deliveryFrequency) {
      reasons.push(`متأخر عن المعتاد بـ ${(daysSinceLastDelivery - productAnalysis.deliveryFrequency).toFixed(0)} يوم`)
    }
    
    if (seasonalFactor > 1.1) reasons.push('موسم ذروة')
    if (seasonalFactor < 0.9) reasons.push('موسم منخفض')
    
    reasons.push(`تاريخ الطلب: ${productAnalysis.deliveryCount} مرة سابقا`)
    
    return reasons.join(' • ')
  }

  private predictNextOrderDate(history: RealBranchHistory): string {
    if (history.issueHistory.length === 0) {
      // No history, predict based on average frequency
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + 30)
      return nextDate.toISOString().split('T')[0]
    }
    
    // Calculate average frequency from all products
    const frequencies = history.productAnalysis.map(p => p.deliveryFrequency).filter(f => f > 0)
    const averageFrequency = frequencies.length > 0 ? 
      frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length : 30
    
    // Get the most recent order date
    const lastOrder = new Date(history.issueHistory[history.issueHistory.length - 1].date)
    const nextDate = new Date(lastOrder)
    nextDate.setDate(lastOrder.getDate() + averageFrequency)
    
    return nextDate.toISOString().split('T')[0]
  }

  private calculatePredictionConfidence(history: RealBranchHistory, predictedProducts: any[]): number {
    if (predictedProducts.length === 0) return 0.1
    
    const avgProductConfidence = predictedProducts.reduce((sum, p) => sum + p.confidence, 0) / predictedProducts.length
    
    // Adjust based on data quality
    const dataQuality = Math.min(1.0, history.issueHistory.length / 10)
    
    return (avgProductConfidence * 0.7) + (dataQuality * 0.3)
  }

  private generatePredictionFactors(history: RealBranchHistory, predictedProducts: any[]): string[] {
    const factors: string[] = []
    
    factors.push(`تاريخ الطلب: ${history.issueHistory.length} طلب سابق`)
    factors.push(`متوسط حجم الطلب: ${history.overallPattern.averageOrderSize.toFixed(0)} منتج`)
    factors.push(`متوسط القيمة: ${history.overallPattern.averageOrderValue.toFixed(0)} ريال`)
    
    const urgentProducts = predictedProducts.filter(p => p.urgencyLevel === 'critical' || p.urgencyLevel === 'high')
    if (urgentProducts.length > 0) {
      factors.push(`${urgentProducts.length} منتجات تحتاج اهتمام عاجل`)
    }
    
    const increasingProducts = history.productAnalysis.filter(p => p.trend === 'increasing')
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

  // Get all predictions
  getAllPredictions(): RealBranchPrediction[] {
    const predictions: RealBranchPrediction[] = []
    
    this.branchHistory.forEach((history, branchId) => {
      const prediction = this.predictNextOrderForBranch(branchId)
      if (prediction) {
        predictions.push(prediction)
      }
    })

    return predictions.sort((a, b) => 
      new Date(a.nextOrderPrediction.expectedDate).getTime() - 
      new Date(b.nextOrderPrediction.expectedDate).getTime()
    )
  }

  // Generate comprehensive report
  generateRealBranchesReport(): string {
    const predictions = this.getAllPredictions()
    
    return `
=== تقرير توقعات طلبات الفروع (بيانات حقيقية) ===
تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}
مصدر البيانات: ${this.issues.length} عملية صرف مسجلة

=== ملخص الفروع ===
إجمالي الفروع المحللة: ${this.branchHistory.size}
إجمالي الطلبات المحللة: ${this.issues.length}
إجمالي التوقعات: ${predictions.reduce((sum, p) => sum + p.nextOrderPrediction.totalPredictedQuantity, 0)} وحدة
القيمة التقديرية الإجمالية: ${predictions.reduce((sum, p) => sum + p.nextOrderPrediction.estimatedValue, 0).toFixed(0)} ريال

=== توقعات كل فرع ===
${predictions.map(prediction => `
🏢 ${prediction.branchName}
📅 التاريخ المتوقع: ${prediction.nextOrderPrediction.expectedDate}
🎯 الثقة: ${(prediction.nextOrderPrediction.confidence * 100).toFixed(1)}%
📦 إجمالي متوقع: ${prediction.nextOrderPrediction.totalPredictedQuantity} وحدة
💰 القيمة التقديرية: ${prediction.nextOrderPrediction.estimatedValue.toFixed(0)} ريال

📋 المنتجات المتوقعة (أعلى 5):
${prediction.nextOrderPrediction.predictedProducts.slice(0, 5).map(p => 
  `   ${p.urgencyLevel === 'critical' ? '🚨' : p.urgencyLevel === 'high' ? '⚠️' : '📦'} ${p.productName}: ${p.predictedQuantity} وحدة (${(p.confidence * 100).toFixed(0)}% ثقة)
   ${p.reasoning}`
).join('\n')}
`).join('\n')}

=== تحليل البيانات ===
• إجمالي عمليات الصرف: ${this.issues.length}
• الفروع النشطة: ${this.branchHistory.size}
• متوسط عمليات الصرف للفرع: ${(this.issues.length / Math.max(1, this.branchHistory.size)).toFixed(1)}
• الفترة المحللة: ${this.getAnalysisPeriod()}

=== توصيات استراتيجية ===
${this.generateStrategicRecommendations(predictions)}
    `.trim()
  }

  private getAnalysisPeriod(): string {
    if (this.issues.length === 0) return 'لا توجد بيانات'
    
    const dates = this.issues.map(issue => new Date(issue.createdAt))
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    
    return `${minDate.toLocaleDateString('ar-SA')} - ${maxDate.toLocaleDateString('ar-SA')}`
  }

  private generateStrategicRecommendations(predictions: RealBranchPrediction[]): string[] {
    const recommendations: string[] = []
    
    // Check for urgent orders
    const urgentOrders = predictions.filter(p => {
      const daysUntil = this.getDaysSince(p.nextOrderPrediction.expectedDate)
      return daysUntil <= 7
    })
    
    if (urgentOrders.length > 0) {
      recommendations.push(`🔴 ${urgentOrders.length} فروع تتوقع طلبات خلال 7 أيام القادمة`)
    }
    
    // Check for high-value orders
    const highValueOrders = predictions.filter(p => p.nextOrderPrediction.estimatedValue > 10000)
    if (highValueOrders.length > 0) {
      recommendations.push(`💰 ${highValueOrders.length} فروع ذات قيمة طلب متوقعة عالية (>10,000 ريال)`)
    }
    
    // Check for branches with no recent activity
    const inactiveBranches = this.branchHistory.size - predictions.length
    if (inactiveBranches > 0) {
      recommendations.push(`⚠️ ${inactiveBranches} فرع لم يصدر أي طلب مؤخراً`)
    }
    
    return recommendations
  }
}
