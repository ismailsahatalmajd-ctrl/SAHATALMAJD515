import { Product, Issue, Return, Transaction } from './types'
import { convertNumbersToEnglish } from './utils'

export interface DemandAnalysis {
  totalProducts: number
  lowStockProducts: number
  outOfStockProducts: number
  topRequestedProducts: ProductDemand[]
  monthlyTrends: MonthlyTrend[]
  branchDemand: BranchDemand[]
  recommendations: Recommendation[]
}

export interface ProductDemand {
  product: Product
  demandScore: number
  requestFrequency: number
  averageQuantity: number
  lastRequestDate?: string
  trend: 'increasing' | 'decreasing' | 'stable'
}

export interface MonthlyTrend {
  month: string
  totalRequests: number
  totalQuantity: number
  topProducts: string[]
}

export interface BranchDemand {
  branchName: string
  totalRequests: number
  topProducts: string[]
  averageOrderValue: number
}

export interface Recommendation {
  type: 'restock' | 'promotion' | 'monitor' | 'urgent'
  productCode: string
  productName: string
  currentStock: number
  recommendedQuantity: number
  reason: string
  priority: 'high' | 'medium' | 'low'
}

export class InventoryDemandAnalyzer {
  private products: Product[]
  private issues: Issue[]
  private returns: Return[]
  private transactions: Transaction[]

  constructor(
    products: Product[],
    issues: Issue[],
    returns: Return[],
    transactions: Transaction[]
  ) {
    this.products = products
    this.issues = issues
    this.returns = returns
    this.transactions = transactions
  }

  analyze(): DemandAnalysis {
    const stockStatus = this.analyzeStockStatus()
    const productDemand = this.analyzeProductDemand()
    const monthlyTrends = this.analyzeMonthlyTrends()
    const branchDemand = this.analyzeBranchDemand()
    const recommendations = this.generateRecommendations(productDemand)

    return {
      totalProducts: this.products.length,
      lowStockProducts: stockStatus.lowStock,
      outOfStockProducts: stockStatus.outOfStock,
      topRequestedProducts: productDemand.slice(0, 10),
      monthlyTrends,
      branchDemand,
      recommendations
    }
  }

  private analyzeStockStatus() {
    const lowStock = this.products.filter(p => 
      p.currentStock > 0 && p.currentStock <= (p.lowStockThresholdPercentage ? p.currentStock * (p.lowStockThresholdPercentage / 100) : 5)
    ).length
    
    const outOfStock = this.products.filter(p => p.currentStock === 0).length

    return { lowStock, outOfStock }
  }

  private analyzeProductDemand(): ProductDemand[] {
    const productMap = new Map<string, ProductDemand>()

    // Analyze issues (requests)
    this.issues.forEach(issue => {
      issue.items?.forEach(item => {
        const existing = productMap.get(item.productCode)
        const product = this.products.find(p => p.productCode === item.productCode)
        
        if (product) {
          if (existing) {
            existing.requestFrequency++
            existing.averageQuantity = (existing.averageQuantity + item.quantity) / 2
          } else {
            productMap.set(item.productCode, {
              product,
              demandScore: 0,
              requestFrequency: 1,
              averageQuantity: item.quantity,
              lastRequestDate: issue.date,
              trend: 'stable'
            })
          }
        }
      })
    })

    // Calculate demand scores and trends
    const demands = Array.from(productMap.values())
    demands.forEach(demand => {
      // Calculate demand score based on frequency, quantity, and recency
      demand.demandScore = this.calculateDemandScore(demand)
      demand.trend = this.calculateTrend(demand)
    })

    return demands.sort((a, b) => b.demandScore - a.demandScore)
  }

  private calculateDemandScore(demand: ProductDemand): number {
    const frequencyWeight = 0.4
    const quantityWeight = 0.3
    const recencyWeight = 0.3

    const frequencyScore = Math.min(demand.requestFrequency / 10, 1)
    const quantityScore = Math.min(demand.averageQuantity / 100, 1)
    
    let recencyScore = 0
    if (demand.lastRequestDate) {
      const daysSinceLastRequest = this.getDaysSince(demand.lastRequestDate)
      recencyScore = Math.max(0, 1 - (daysSinceLastRequest / 90))
    }

    return (frequencyScore * frequencyWeight) + 
           (quantityScore * quantityWeight) + 
           (recencyScore * recencyWeight)
  }

  private calculateTrend(demand: ProductDemand): 'increasing' | 'decreasing' | 'stable' {
    // Simple trend calculation based on recent vs older requests
    const recentRequests = this.issues.filter(issue => 
      this.getDaysSince(issue.date) <= 30
    ).length
    
    const olderRequests = this.issues.filter(issue => 
      this.getDaysSince(issue.date) > 30 && this.getDaysSince(issue.date) <= 60
    ).length

    if (recentRequests > olderRequests * 1.2) return 'increasing'
    if (recentRequests < olderRequests * 0.8) return 'decreasing'
    return 'stable'
  }

  private analyzeMonthlyTrends(): MonthlyTrend[] {
    const monthlyMap = new Map<string, { requests: number; quantity: number; products: Map<string, number> }>()

    this.issues.forEach(issue => {
      const month = issue.date.substring(0, 7) // YYYY-MM format
      const existing = monthlyMap.get(month) || { requests: 0, quantity: 0, products: new Map() }
      
      existing.requests++
      issue.items?.forEach(item => {
        existing.quantity += item.quantity
        const productCount = existing.products.get(item.productCode) || 0
        existing.products.set(item.productCode, productCount + item.quantity)
      })
      
      monthlyMap.set(month, existing)
    })

    return Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        totalRequests: data.requests,
        totalQuantity: data.quantity,
        topProducts: Array.from(data.products.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([code]) => code)
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12)
  }

  private analyzeBranchDemand(): BranchDemand[] {
    const branchMap = new Map<string, { requests: number; products: Map<string, number>; totalValue: number }>()

    this.issues.forEach(issue => {
      const branchName = issue.branchName || 'Unknown'
      const existing = branchMap.get(branchName) || { requests: 0, products: new Map(), totalValue: 0 }
      
      existing.requests++
      issue.items?.forEach(item => {
        const product = this.products.find(p => p.productCode === item.productCode)
        const value = product ? product.price * item.quantity : 0
        existing.totalValue += value
        
        const productCount = existing.products.get(item.productCode) || 0
        existing.products.set(item.productCode, productCount + item.quantity)
      })
      
      branchMap.set(branchName, existing)
    })

    return Array.from(branchMap.entries()).map(([branchName, data]) => ({
      branchName,
      totalRequests: data.requests,
      topProducts: Array.from(data.products.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => code),
      averageOrderValue: data.requests > 0 ? data.totalValue / data.requests : 0
    }))
  }

  private generateRecommendations(productDemand: ProductDemand[]): Recommendation[] {
    const recommendations: Recommendation[] = []

    productDemand.forEach(demand => {
      const product = demand.product
      const currentStock = product.currentStock
      const avgMonthlyDemand = demand.averageQuantity * demand.requestFrequency

      // Urgent restock needed
      if (currentStock === 0 && demand.demandScore > 0.3) {
        recommendations.push({
          type: 'urgent',
          productCode: product.productCode,
          productName: product.productName,
          currentStock,
          recommendedQuantity: Math.ceil(avgMonthlyDemand * 2),
          reason: 'المنتج نفد من المخزون والطلب عليه مرتفع',
          priority: 'high'
        })
      }
      // Low stock restock
      else if (currentStock > 0 && currentStock <= avgMonthlyDemand * 0.5 && demand.demandScore > 0.2) {
        recommendations.push({
          type: 'restock',
          productCode: product.productCode,
          productName: product.productName,
          currentStock,
          recommendedQuantity: Math.ceil(avgMonthlyDemand * 1.5),
          reason: 'المخزون منخفض وقد ينفد قريباً',
          priority: 'medium'
        })
      }
      // Monitor decreasing trend
      else if (demand.trend === 'decreasing' && currentStock > avgMonthlyDemand * 2) {
        recommendations.push({
          type: 'monitor',
          productCode: product.productCode,
          productName: product.productName,
          currentStock,
          recommendedQuantity: 0,
          reason: 'الطلب على المنتج في انخفاض',
          priority: 'low'
        })
      }
      // Promotion for excess stock
      else if (currentStock > avgMonthlyDemand * 3 && demand.demandScore < 0.1) {
        recommendations.push({
          type: 'promotion',
          productCode: product.productCode,
          productName: product.productName,
          currentStock,
          recommendedQuantity: 0,
          reason: 'المخزون زائد عن الحد والطلب منخفض',
          priority: 'low'
        })
      }
    })

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }

  private getDaysSince(dateString: string): number {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  generateReport(): string {
    const analysis = this.analyze()
    
    return `
=== تقرير تحليل وتوقعات الطلبات ===
تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}

=== نظرة عامة على المخزون ===
إجمالي المنتجات: ${analysis.totalProducts}
منتجات منخفضة المخزون: ${analysis.lowStockProducts}
منتجات نفدت من المخزون: ${analysis.outOfStockProducts}

=== المنتجات الأكثر طلباً ===
${analysis.topRequestedProducts.slice(0, 5).map((demand, i) => 
  `${i + 1}. ${demand.product.productName} - درجة الطلب: ${(demand.demandScore * 100).toFixed(1)}%`
).join('\n')}

=== التوصيات ===
${analysis.recommendations.slice(0, 10).map(rec => 
  `${rec.type === 'urgent' ? '🚨' : rec.type === 'restock' ? '📦' : '📊'} ${rec.productName}
   الحالة الحالية: ${rec.currentStock} وحدة
   ${rec.recommendedQuantity > 0 ? `الكمية الموصى بها: ${rec.recommendedQuantity} وحدة` : ''}
   السبب: ${rec.reason}
   الأولوية: ${rec.priority === 'high' ? 'عالية' : rec.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
`).join('\n\n')}

=== ملخص الاتجاهات ===
${analysis.monthlyTrends.slice(0, 3).map(trend => 
  `شهر ${trend.month}: ${trend.totalRequests} طلب بإجمالي ${trend.totalQuantity} وحدة`
).join('\n')}
    `.trim()
  }
}
