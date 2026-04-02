"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  AlertTriangle, 
  Calendar,
  Clock,
  BarChart3,
  Store,
  DollarSign,
  Download,
  RefreshCw
} from 'lucide-react'
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { AdvancedBranchPredictor, type BranchNextOrderPrediction } from "@/lib/advanced-branch-predictor"
import { useToast } from "@/hooks/use-toast"

export function BranchDemandWidget() {
  const [predictions, setPredictions] = useState<BranchNextOrderPrediction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const { toast } = useToast()

  const products = useLiveQuery(() => db.products.toArray())

  useEffect(() => {
    if (products) {
      loadPredictions()
    }
  }, [products])

  const loadPredictions = async () => {
    setLoading(true)
    try {
      const predictor = new AdvancedBranchPredictor(products)
      const allPredictions = []
      
      // Get predictions for all branches
      const branchIds = ['main', 'riyadh', 'jeddah'] // Add your actual branch IDs
      
      for (const branchId of branchIds) {
        const prediction = predictor.predictNextOrderForBranch(branchId)
        if (prediction) {
          allPredictions.push(prediction)
        }
      }
      
      setPredictions(allPredictions.sort((a, b) => 
        new Date(a.nextOrderPrediction.expectedDate).getTime() - 
        new Date(b.nextOrderPrediction.expectedDate).getTime()
      ))
    } catch (error) {
      console.error('Error loading predictions:', error)
      toast({
        title: "خطأ في تحميل التوقعات",
        description: "حدث خطأ أثناء تحميل توقعات الفروع",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const downloadReport = () => {
    if (!products) return

    const predictor = new AdvancedBranchPredictor(products)
    const report = predictor.generateAllBranchesReport()
    
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `branch-demand-report-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "تم تنزيل التقرير",
      description: "تم تنزيل تقرير توقعات الفروع بنجاح"
    })
  }

  const getDaysUntilOrder = (expectedDate: string): number => {
    const today = new Date()
    const expected = new Date(expectedDate)
    const diffTime = expected.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getUrgencyColor = (days: number): string => {
    if (days <= 3) return 'text-red-600 bg-red-50'
    if (days <= 7) return 'text-yellow-600 bg-yellow-50'
    if (days <= 14) return 'text-blue-600 bg-blue-50'
    return 'text-green-600 bg-green-50'
  }

  const getUrgencyBadge = (days: number): 'destructive' | 'default' | 'secondary' => {
    if (days <= 3) return 'destructive'
    if (days <= 7) return 'default'
    return 'secondary'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل توقعات الفروع...</p>
        </div>
      </div>
    )
  }

  const selectedPrediction = selectedBranch 
    ? predictions.find(p => p.branchId === selectedBranch)
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6" />
            توقعات طلبات الفروع
          </h2>
          <p className="text-muted-foreground mt-1">
            التنبؤ بالطلبات القادمة لكل فرع بناءً على البيانات التاريخية
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPredictions} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            تحديث
          </Button>
          <Button onClick={downloadReport} size="sm">
            <Download className="h-4 w-4 mr-2" />
            تقرير
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الفروع</CardTitle>
            <Store className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{predictions.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              فرع نشط
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">طلبات عاجلة</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {predictions.filter(p => getDaysUntilOrder(p.nextOrderPrediction.expectedDate) <= 3).length}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              خلال 3 أيام
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الكميات</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {predictions.reduce((sum, p) => sum + p.nextOrderPrediction.totalPredictedQuantity, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              وحدة متوقعة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">القيمة التقديرية</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {predictions.reduce((sum, p) => sum + p.nextOrderPrediction.estimatedValue, 0).toFixed(0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ريال سعودي
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Branches List */}
        <Card>
          <CardHeader>
            <CardTitle>الفروع والتوقعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {predictions.map((prediction) => {
                const daysUntil = getDaysUntilOrder(prediction.nextOrderPrediction.expectedDate)
                const urgencyColor = getUrgencyColor(daysUntil)
                
                return (
                  <div 
                    key={prediction.branchId}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedBranch === prediction.branchId ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => setSelectedBranch(prediction.branchId)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{prediction.branchName}</h3>
                      <Badge variant={getUrgencyBadge(daysUntil)}>
                        {daysUntil <= 0 ? 'متأخر' : `خلال ${daysUntil} يوم`}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">التاريخ:</span>
                        <div className="font-medium">{prediction.nextOrderPrediction.expectedDate}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">الكمية:</span>
                        <div className="font-medium">{prediction.nextOrderPrediction.totalPredictedQuantity} وحدة</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">الثقة:</span>
                        <div className="font-medium">{(prediction.nextOrderPrediction.confidence * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">القيمة:</span>
                        <div className="font-medium">{prediction.nextOrderPrediction.estimatedValue.toFixed(0)} ريال</div>
                      </div>
                    </div>

                    <div className="mt-2">
                      <Progress value={prediction.nextOrderPrediction.confidence * 100} className="h-2" />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Branch Details */}
        {selectedPrediction && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                {selectedPrediction.branchName} - تفاصيل الطلب
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Order Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm text-muted-foreground">التاريخ المتوقع:</span>
                    <div className="font-semibold">{selectedPrediction.nextOrderPrediction.expectedDate}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">الثقة:</span>
                    <div className="font-semibold">{(selectedPrediction.nextOrderPrediction.confidence * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">إجمالي الكمية:</span>
                    <div className="font-semibold">{selectedPrediction.nextOrderPrediction.totalPredictedQuantity} وحدة</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">القيمة التقديرية:</span>
                    <div className="font-semibold">{selectedPrediction.nextOrderPrediction.estimatedValue.toFixed(0)} ريال</div>
                  </div>
                </div>

                {/* Prediction Factors */}
                <div>
                  <h4 className="font-semibold mb-2">عوامل التنبؤ:</h4>
                  <div className="space-y-1">
                    {selectedPrediction.nextOrderPrediction.factors.map((factor, index) => (
                      <div key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        {factor}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Predicted Products */}
                <div>
                  <h4 className="font-semibold mb-2">المنتجات المتوقعة:</h4>
                  <div className="space-y-2">
                    {selectedPrediction.nextOrderPrediction.predictedProducts.map((product, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <h5 className="font-medium">{product.productName}</h5>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              product.urgencyLevel === 'critical' ? 'destructive' :
                              product.urgencyLevel === 'high' ? 'default' : 'secondary'
                            }>
                              {product.urgencyLevel === 'critical' ? 'عاجل' : 
                               product.urgencyLevel === 'high' ? 'مرتفع' : 'عادي'}
                            </Badge>
                            <span className="text-sm font-semibold">{product.predictedQuantity} وحدة</span>
                          </div>
                        </div>
                        
                        <div className="text-sm text-muted-foreground mb-2">
                          {product.reasoning}
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">آخر كمية:</span>
                            <div className="font-medium">{product.lastDeliveryQuantity}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">المتوسط:</span>
                            <div className="font-medium">{product.averageDeliveryQuantity.toFixed(1)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">الثقة:</span>
                            <div className="font-medium">{(product.confidence * 100).toFixed(0)}%</div>
                          </div>
                        </div>
                        
                        <div className="mt-2">
                          <Progress value={product.confidence * 100} className="h-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Alert for urgent orders */}
      {predictions.some(p => getDaysUntilOrder(p.nextOrderPrediction.expectedDate) <= 3) && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">تنبيهات عاجلة</AlertTitle>
          <AlertDescription className="text-red-700">
            هناك {predictions.filter(p => getDaysUntilOrder(p.nextOrderPrediction.expectedDate) <= 3).length} فروع تتوقع طلبات خلال 3 أيام القادمة
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
