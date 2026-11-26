/* config.js — ตั้งค่าการเชื่อมต่อ Supabase
   1) เปิด Supabase > Project Settings > API (หรือ Data API) แล้วคัดลอก Project URL และ anon / publishable key
   2) วางค่าด้านล่าง แล้ว commit ขึ้น GitHub — Vercel จะ deploy ให้อัตโนมัติ
   คีย์ anon/publishable ออกแบบมาให้ใช้ฝั่งเบราว์เซอร์ได้ ความปลอดภัยของข้อมูลควบคุมด้วย Row Level Security (ดู supabase/schema.sql)
   ห้ามใส่ service_role key หรือ secret key ในไฟล์นี้เด็ดขาด
   ถ้าเว้นว่าง ระบบจะบันทึกรอบรันไว้ในเบราว์เซอร์เครื่องนี้แทน (และตั้งค่าเพิ่มภายหลังได้ที่หน้า "ตั้งค่า") */
window.TT_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
