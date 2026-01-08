import { redirect } from "next/navigation"

export default function ProductsRedirectPage() {
  // إعادة توجيه رابط /products إلى الصفحة الرئيسية التي تعرض جدول المنتجات
  redirect("/")
}