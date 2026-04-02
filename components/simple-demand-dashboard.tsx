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
  Clock
} from 'lucide-react'
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { SimpleDemandPredictor, type SimpleAlert } from "@/lib/smart-demand-predictor"
import { DualText } from "@/components/ui/dual-text"
import { useToast } from "@/hooks/use-toast"

export function SimpleDemandDashboard() {
  const [predictions, setPredictions] = useState<any[]>([])
  const [alerts, setAlerts] = useState<SimpleAlert[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const products = useLiveQuery(() => db.products.toArray())

  useEffect(() => {
    if (products) {
      setLoading(false)
      
      try {
        const predictor = new SimpleDemandPredictor(products)
        const result = predictor.generatePredictions()
        const alertResult = predictor.generateSimpleAlerts()
        
        setPredictions(result)
        setAlerts(alertResult)
      } catch (error) {
        console.error('Error analyzing demand:', error)
        toast({
          title: "خطأ في التحليل",
          description: "حدث خطأ أثناء تحليل بيانات الطلب",
          variant: "destructive"
        })
      }
    }
  }, [products, toast])

  const downloadReport = () => {
    if (!products) return

    const predictor = new SimpleDemandPredictor(products)
    const report = predictor.generateSimpleReport()
    
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

  const urgentAlerts = alerts.filter(a => a.priority === 'critical')
  const highAlerts = alerts.filter(a => a.priority === 'high')
  const lowStockProducts = predictions.filter(p => p.urgencyLevel === 'critical' || p.urgencyLevel === 'high')
  const outOfStockProducts = predictions.filter(p => p.currentStock === 0)
  const stockHealthPercentage = ((products.length - lowStockProducts.length - outOfStockProducts.length) / products.length) * 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            تحليل وتوقعات الطلبات
          </h2>
          <p className="text-muted-foreground mt-1">
            تحليل وتوقعات الطلبات بناءً على البيانات الحالية
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
              {products.length - lowStockProducts.length - outOfStockProducts.length} من {products.length} منتج جيد
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">منتجات منخفضة</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{lowStockProducts.length}</div>
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
            <div className="text-2xl font-bold text-red-600">{outOfStockProducts.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              تحتاج طلب فوري
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التوقعات</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{predictions.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {urgentAlerts.length} عاجلة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">التنبيهات</TabsTrigger>
          <TabsTrigger value="predictions">التوقعات</TabsTrigger>
          <TabsTrigger value="orders">قائمة الطلبات</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          {urgentAlerts.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">تنبيهات عاجلة</AlertTitle>
              <AlertDescription className="text-red-700">
                هناك {urgentAlerts.length} منتجات تحتاج طلب فوري
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            {alerts.slice(0, 10).map((alert, index) => (
              <Card key={index} className={
                alert.type === 'stock_out' ? 'border-red-200 bg-red-50' :
                alert.type === 'low_stock' ? 'border-yellow-200 bg-yellow-50' :
                'border-blue-200 bg-blue-50'
              }>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {alert.type === 'stock_out' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                        {alert.type === 'low_stock' && <Package className="h-4 w-4 text-yellow-600" />}
                        {alert.type === 'overstock' && <ShoppingCart className="h-4 w-4 text-green-600" />}
                        <h4 className="font-semibold">{alert.productName}</h4>
                        <Badge variant={
                          alert.priority === 'critical' ? 'destructive' :
                          alert.priority === 'high' ? 'default' : 'secondary'
                        }>
                          {alert.priority === 'critical' ? 'عاجلة' : alert.priority === 'high' ? 'عالية' : 'منخفضة'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-4">
          <div className="grid gap-4">
            {predictions.slice(0, 10).map((prediction, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{prediction.productName}</h4>
                      <p className="text-sm text-muted-foreground">الكود: {prediction.productCode}</p>
                      <div className="flex items-center gap-4 text-sm mt-2">
                        <span>المخزون الحالي: <strong>{prediction.currentStock}</strong></span>
                        <span>الطلب المتوقع: <strong>{prediction.predictedMonthlyDemand}</strong></span>
                        <span>الثقة: <strong>{(prediction.confidence * 100).toFixed(1)}%</strong></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">
                        {prediction.recommendedOrderQuantity > 0 ? `${prediction.recommendedOrderQuantity} وحدة` : 'لا حاجة'}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {prediction.urgencyLevel === 'critical' ? 'عاجل' : 
                         prediction.urgencyLevel === 'high' ? 'عالي' : 
                         prediction.urgencyLevel === 'medium' ? 'متوسط' : 'منخفض'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>قائمة الطلبات الموصى بها</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {predictions
                  .filter(p => p.recommendedOrderQuantity > 0)
                  .slice(0, 10)
                  .map((prediction, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-semibold">{prediction.productName}</h4>
                        <p className="text-sm text-muted-foreground">{prediction.productCode}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{prediction.recommendedOrderQuantity} وحدة</div>
                        <p className="text-xs text-muted-foreground">
                          {prediction.urgencyLevel === 'critical' ? 'طلب عاجل' :
                           prediction.urgencyLevel === 'high' ? 'إعادة تخزين' :
                           prediction.urgencyLevel === 'medium' ? 'تجديد وقائي' : 'لا حاجة'}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
