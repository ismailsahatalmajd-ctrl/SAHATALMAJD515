"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  Download,
  BarChart3,
  ShoppingCart,
  Store,
  Clock
} from 'lucide-react'
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { SimpleDemandPredictor, type SimpleAlert } from "@/lib/smart-demand-predictor"
import { DualText } from "@/components/ui/dual-text"
import { useToast } from "@/hooks/use-toast"

export function DemandAnalysisDashboard() {
  const [analysis, setAnalysis] = useState<DemandAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const products = useLiveQuery(() => db.products.toArray())
  const issues = useLiveQuery(() => db.issues.toArray())
  const returns = useLiveQuery(() => db.returns.toArray())
  const transactions = useLiveQuery(() => db.transactions.toArray())

  useEffect(() => {
    if (products && issues && returns && transactions) {
      setLoading(false)
      
      try {
        const analyzer = new InventoryDemandAnalyzer(products, issues, returns, transactions)
        const result = analyzer.analyze()
        setAnalysis(result)
      } catch (error) {
        console.error('Error analyzing demand:', error)
        toast({
          title: "خطأ في التحليل",
          description: "حدث خطأ أثناء تحليل بيانات الطلب",
          variant: "destructive"
        })
      }
    }
  }, [products, issues, returns, transactions, toast])

  const downloadReport = () => {
    if (!analysis || !products || !issues || !returns || !transactions) return

    const analyzer = new InventoryDemandAnalyzer(products, issues, returns, transactions)
    const report = analyzer.generateReport()
    
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `demand-analysis-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "تم تنزيل التقرير",
      description: "تم تحليل وتنزيل تقرير الطلبات بنجاح"
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحليل البيانات...</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>غير قادر على تحليل البيانات</AlertTitle>
        <AlertDescription>
          يرجى التأكد من وجود بيانات كافية للتحليل
        </AlertDescription>
      </Alert>
    )
  }

  const urgentRecommendations = analysis.recommendations.filter(r => r.type === 'urgent')
  const restockRecommendations = analysis.recommendations.filter(r => r.type === 'restock')
  const stockHealthPercentage = ((analysis.totalProducts - analysis.lowStockProducts - analysis.outOfStockProducts) / analysis.totalProducts) * 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            <DualText k="dashboard.demand_analysis" />
          </h2>
          <p className="text-muted-foreground mt-1">
            تحليل وتوقعات الطلبات بناءً على البيانات التاريخية
          </p>
        </div>
        <Button onClick={downloadReport} className="gap-2">
          <Download className="h-4 w-4" />
          <span>تحميل التقرير</span>
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">صحة المخزون</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stockHealthPercentage.toFixed(1)}%</div>
            <Progress value={stockHealthPercentage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {analysis.totalProducts - analysis.lowStockProducts - analysis.outOfStockProducts} من {analysis.totalProducts} منتج جيد
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">منتجات منخفضة</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{analysis.lowStockProducts}</div>
            <p className="text-xs text-muted-foreground mt-2">
              تحتاج إعادة تخزين قريباً
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">منتجات نفدت</CardTitle>
            <Package className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{analysis.outOfStockProducts}</div>
            <p className="text-xs text-muted-foreground mt-2">
              تحتاج طلب فوري
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التوصيات</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{analysis.recommendations.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {urgentRecommendations.length} عاجلة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="recommendations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recommendations">التوصيات</TabsTrigger>
          <TabsTrigger value="top-products">المنتجات المطلوبة</TabsTrigger>
          <TabsTrigger value="trends">الاتجاهات</TabsTrigger>
          <TabsTrigger value="branches">الطلب حسب الفرع</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          {urgentRecommendations.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">توصيات عاجلة</AlertTitle>
              <AlertDescription className="text-red-700">
                هناك {urgentRecommendations.length} منتجات تحتاج طلب فوري
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            {analysis.recommendations.slice(0, 10).map((rec, index) => (
              <Card key={index} className={
                rec.type === 'urgent' ? 'border-red-200 bg-red-50' :
                rec.type === 'restock' ? 'border-yellow-200 bg-yellow-50' :
                'border-blue-200 bg-blue-50'
              }>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {rec.type === 'urgent' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                        {rec.type === 'restock' && <Package className="h-4 w-4 text-yellow-600" />}
                        {rec.type === 'monitor' && <TrendingDown className="h-4 w-4 text-blue-600" />}
                        {rec.type === 'promotion' && <ShoppingCart className="h-4 w-4 text-green-600" />}
                        <h4 className="font-semibold">{rec.productName}</h4>
                        <Badge variant={
                          rec.priority === 'high' ? 'destructive' :
                          rec.priority === 'medium' ? 'default' : 'secondary'
                        }>
                          {rec.priority === 'high' ? 'عالية' : rec.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{rec.reason}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span>المخزون الحالي: <strong>{rec.currentStock}</strong></span>
                        {rec.recommendedQuantity > 0 && (
                          <span>موصى به: <strong>{rec.recommendedQuantity}</strong></span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="top-products" className="space-y-4">
          <div className="grid gap-4">
            {analysis.topRequestedProducts.slice(0, 10).map((demand, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{demand.product.productName}</h4>
                      <p className="text-sm text-muted-foreground">الكود: {demand.product.productCode}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 mb-1">
                        {demand.trend === 'increasing' && <TrendingUp className="h-4 w-4 text-green-600" />}
                        {demand.trend === 'decreasing' && <TrendingDown className="h-4 w-4 text-red-600" />}
                        {demand.trend === 'stable' && <Clock className="h-4 w-4 text-blue-600" />}
                        <span className="text-sm font-medium">
                          {demand.trend === 'increasing' ? 'متزايد' : 
                           demand.trend === 'decreasing' ? 'منخفض' : 'مستقر'}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-blue-600">
                        {(demand.demandScore * 100).toFixed(1)}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {demand.requestFrequency} طلب • متوسط {demand.averageQuantity.toFixed(1)} وحدة
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <div className="grid gap-4">
            {analysis.monthlyTrends.slice(0, 6).map((trend, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{trend.month}</h4>
                      <p className="text-sm text-muted-foreground">
                        {trend.totalRequests} طلب • {trend.totalQuantity} وحدة إجمالية
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium mb-1">أكثر المنتجات:</div>
                      <div className="flex flex-wrap gap-1">
                        {trend.topProducts.slice(0, 3).map(code => (
                          <Badge key={code} variant="secondary" className="text-xs">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <div className="grid gap-4">
            {analysis.branchDemand.slice(0, 10).map((branch, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-blue-600" />
                      <div>
                        <h4 className="font-semibold">{branch.branchName}</h4>
                        <p className="text-sm text-muted-foreground">
                          {branch.totalRequests} طلب • متوسط {branch.averageOrderValue.toFixed(0)} ريال
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium mb-1">أكثر المنتجات:</div>
                      <div className="flex flex-wrap gap-1">
                        {branch.topProducts.slice(0, 3).map(code => (
                          <Badge key={code} variant="secondary" className="text-xs">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
